// Supabase Edge Function: stripe-webhook — Stripe is the only payment write source
import { getServiceDb } from "../_shared/stripeIdempotency.ts";
import {
  WEBHOOK_EVENTS,
  confirmPaymentFromWebhook,
  handleSessionCreated,
  markPaymentFailed,
  resolveOrderIdForSession,
  logPaymentError,
} from "../_shared/paymentEngine.ts";
import {
  LOG_EVENTS,
  claimStripeEvent,
  alreadyProcessedSession,
  logStripeEvent,
  structuredLog,
} from "../_shared/stripeIdempotency.ts";

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

const RETRY_DELAYS_MS = [1000, 2000, 5000];
const MAX_RETRIES = 3;

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<StripeEvent> {
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => { const [k, v] = p.split("="); return [k, v]; })) as { t?: string; v1?: string };
  if (!parts.t || !parts.v1) throw new Error("Invalid stripe-signature header");
  const signed = `${parts.t}.${payload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected !== parts.v1) throw new Error("Webhook signature mismatch");
  return JSON.parse(payload);
}

function extractSessionId(event: StripeEvent): string | null {
  const obj = event.data.object;
  if (event.type.startsWith("checkout.session.")) return obj.id as string;
  return (obj.metadata as Record<string, string> | undefined)?.session_id ?? null;
}

async function dispatchEvent(db: ReturnType<typeof getServiceDb>, event: StripeEvent) {
  const sessionId = extractSessionId(event);
  if (!WEBHOOK_EVENTS.has(event.type)) {
    await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId, status: "ignored" });
    return;
  }
  if (sessionId && (await alreadyProcessedSession(db, sessionId)) && event.type !== "payment_intent.payment_failed") {
    await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId, status: "processed" });
    return;
  }
  if (event.type === "checkout.session.created") {
    await handleSessionCreated(db, event.data.object);
  } else if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return;
    const sid = session.id as string;
    const orderId = (session.metadata as Record<string, string> | undefined)?.order_id ?? (await resolveOrderIdForSession(db, sid));
    if (!orderId) return;
    await confirmPaymentFromWebhook(db, { orderId, sessionId: sid, paymentIntentId: session.payment_intent as string });
  } else if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const meta = intent.metadata as Record<string, string> | undefined;
    const sid = meta?.session_id ?? sessionId;
    const orderId = meta?.order_id ?? (sid ? await resolveOrderIdForSession(db, sid) : null);
    if (!orderId || !sid) return;
    await confirmPaymentFromWebhook(db, { orderId, sessionId: sid, paymentIntentId: intent.id as string });
  } else if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const meta = intent.metadata as Record<string, string> | undefined;
    await markPaymentFailed(db, { orderId: meta?.order_id, sessionId: meta?.session_id ?? sessionId ?? undefined, paymentIntentId: intent.id as string });
  }
  await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId, status: "processed" });
  structuredLog(LOG_EVENTS.WEBHOOK_PROCESSED, { eventId: event.id, type: event.type, sessionId });
}

async function processWithRetry(db: ReturnType<typeof getServiceDb>, event: StripeEvent) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await dispatchEvent(db, event);
      return;
    } catch (e) {
      await logPaymentError(db, { event_id: event.id, error_message: e instanceof Error ? e.message : String(e), retry_count: attempt + 1 });
      if (attempt >= MAX_RETRIES - 1) throw e;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
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
  const sessionId = extractSessionId(event);

  if ((await claimStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId })) === "duplicate") {
    return new Response("OK", { status: 200 });
  }

  structuredLog(LOG_EVENTS.WEBHOOK_RECEIVED, { eventId: event.id, type: event.type });
  const work = processWithRetry(db, event).catch(async (e) => {
    console.error(e);
    await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId, status: "failed" });
    await logPaymentError(db, { event_id: event.id, session_id: sessionId ?? undefined, error_message: String(e), retry_count: MAX_RETRIES });
  });

  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(work);
  else work.catch(console.error);

  return new Response("OK", { status: 200 });
});
