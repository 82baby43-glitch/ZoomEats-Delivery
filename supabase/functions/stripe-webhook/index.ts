// Supabase Edge Function: stripe-webhook
// Idempotent Stripe webhook handler — returns 200 fast, processes async.

import {
  LOG_EVENTS,
  claimStripeEvent,
  alreadyProcessedSession,
  getServiceDb,
  logStripeEvent,
  markOrderPaidIfNeeded,
  memoryMarkProcessed,
  structuredLog,
} from "../_shared/stripeIdempotency.ts";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<StripeEvent> {
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) throw new Error("Invalid stripe-signature header");

  const signed = `${parts.t}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected !== parts.v1) throw new Error("Webhook signature mismatch");
  return JSON.parse(payload);
}

async function handleCheckoutSessionCompleted(db: ReturnType<typeof getServiceDb>, event: StripeEvent) {
  const session = event.data.object;
  const sessionId = session.id as string;
  const paymentStatus = session.payment_status as string;
  if (paymentStatus !== "paid") return;

  const orderId = (session.metadata as Record<string, string> | undefined)?.order_id;
  if (!orderId) {
    const { data: tx } = await db.from("payment_transactions").select("order_id").eq("session_id", sessionId).maybeSingle();
    if (!tx?.order_id) return;
    await markOrderPaidIfNeeded(db, { orderId: tx.order_id, sessionId, stripeSessionStatus: session.status as string });
    return;
  }

  await markOrderPaidIfNeeded(db, { orderId, sessionId, stripeSessionStatus: session.status as string });
}

async function handlePaymentIntentSucceeded(db: ReturnType<typeof getServiceDb>, event: StripeEvent) {
  const intent = event.data.object;
  const metadata = intent.metadata as Record<string, string> | undefined;
  const orderId = metadata?.order_id;
  const sessionId = metadata?.session_id;

  if (orderId && sessionId) {
    await markOrderPaidIfNeeded(db, { orderId, sessionId });
    return;
  }

  if (sessionId) {
    const { data: tx } = await db.from("payment_transactions").select("order_id").eq("session_id", sessionId).maybeSingle();
    if (tx?.order_id) await markOrderPaidIfNeeded(db, { orderId: tx.order_id, sessionId });
  }
}

async function processEvent(db: ReturnType<typeof getServiceDb>, event: StripeEvent) {
  structuredLog(LOG_EVENTS.WEBHOOK_RECEIVED, { eventId: event.id, type: event.type });

  const sessionId =
    event.type === "checkout.session.completed"
      ? (event.data.object.id as string)
      : (event.data.object.metadata as Record<string, string> | undefined)?.session_id;

  if (sessionId && (await alreadyProcessedSession(db, sessionId))) {
    await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId, status: "processed" });
    memoryMarkProcessed(`evt:${event.id}`);
    structuredLog(LOG_EVENTS.WEBHOOK_PROCESSED, { eventId: event.id, sessionId, skipped: true });
    return;
  }

  if (event.type === "checkout.session.completed") {
    await handleCheckoutSessionCompleted(db, event);
  } else if (event.type === "payment_intent.succeeded") {
    await handlePaymentIntentSucceeded(db, event);
  } else {
    await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId ?? null, status: "ignored" });
    memoryMarkProcessed(`evt:${event.id}`);
    return;
  }

  await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId ?? null, status: "processed" });
  memoryMarkProcessed(`evt:${event.id}`);
  structuredLog(LOG_EVENTS.WEBHOOK_PROCESSED, { eventId: event.id, type: event.type, sessionId });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  if (!webhookSecret) {
    return new Response(JSON.stringify({ error: "Webhook not configured" }), { status: 503 });
  }

  const payload = await req.text();
  const sigHeader = req.headers.get("stripe-signature") || "";

  let event: StripeEvent;
  try {
    event = await verifyStripeSignature(payload, sigHeader, webhookSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid signature";
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }

  const db = getServiceDb();

  const sessionId =
    event.type === "checkout.session.completed"
      ? (event.data.object.id as string)
      : (event.data.object.metadata as Record<string, string> | undefined)?.session_id;

  if ((await claimStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId })) === "duplicate") {
    return new Response("OK", { status: 200 });
  }

  const work = processEvent(db, event).catch(async (e) => {
    console.error("Webhook processing error:", e);
    await logStripeEvent(db, { event_id: event.id, type: event.type, status: "failed" });
  });

  // @ts-ignore EdgeRuntime.waitUntil available in Supabase Edge Functions
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  } else {
    work.catch(console.error);
  }

  return new Response("OK", { status: 200 });
});
