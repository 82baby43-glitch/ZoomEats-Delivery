// Stripe webhook — verify signature, update order on checkout.session.completed
import { getServiceDb, isEventProcessed, markEventProcessed } from "../_shared/stripeIdempotency.ts";
import { getStripeWebhookSecret } from "../_shared/stripeEnv.ts";

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<StripeEvent> {
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => {
    const [k, v] = p.split("=");
    return [k, v];
  })) as { t?: string; v1?: string };
  if (!parts.t || !parts.v1) throw new Error("Invalid stripe-signature header");
  const signed = `${parts.t}.${payload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected !== parts.v1) throw new Error("Webhook signature mismatch");
  return JSON.parse(payload);
}

async function processEvent(db: ReturnType<typeof getServiceDb>, event: StripeEvent) {
  if (await isEventProcessed(db, event.id)) {
    console.log(JSON.stringify({ event_type: event.type, skipped: "duplicate_event_id" }));
    return;
  }

  const obj = event.data.object;
  const sessionId = event.type.startsWith("checkout.session.") ? (obj.id as string) : null;
  const paymentIntentId = (obj.payment_intent as string) ?? null;
  const orderId = (obj.metadata as Record<string, string> | undefined)?.order_id ?? null;

  console.log(JSON.stringify({ event_type: event.type, order_id: orderId, session_id: sessionId, payment_intent_id: paymentIntentId }));

  if (event.type === "checkout.session.completed") {
    if (obj.payment_status !== "paid" || !orderId) return;
    const sid = obj.id as string;
    await db.from("orders").update({
      payment_status: "paid",
      order_status: "confirmed",
      status: "placed",
      stripe_session_id: sid,
    }).eq("order_id", orderId);
    await db.from("payment_transactions").update({ payment_status: "paid", status: "complete" }).eq("session_id", sid);
  }

  await markEventProcessed(db, {
    event_id: event.id,
    type: event.type,
    session_id: sessionId,
    payment_intent_id: paymentIntentId,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) return new Response(JSON.stringify({ error: "Webhook not configured" }), { status: 503 });

  const payload = await req.text();
  const sigHeader = req.headers.get("stripe-signature") || "";

  let event: StripeEvent;
  try {
    event = await verifyStripeSignature(payload, sigHeader, webhookSecret);
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid signature" }), { status: 400 });
  }

  const db = getServiceDb();
  try {
    await processEvent(db, event);
  } catch (e) {
    console.error("webhook error:", e);
    return new Response(JSON.stringify({ error: "processing failed" }), { status: 500 });
  }

  return new Response("OK", { status: 200 });
});
