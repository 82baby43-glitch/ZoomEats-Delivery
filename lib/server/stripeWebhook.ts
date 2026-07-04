import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LOG_EVENTS,
  alreadyProcessedSession,
  logStripeEvent,
  structuredLog,
  claimStripeEvent,
} from "./stripeIdempotency";
import {
  WEBHOOK_EVENTS,
  confirmPaymentFromWebhook,
  handleSessionCreated,
  markPaymentFailed,
  resolveOrderIdForSession,
  logPaymentError,
} from "./paymentEngine";

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

const RETRY_DELAYS_MS = [1000, 2000, 5000];
const MAX_RETRIES = 3;

function extractSessionId(event: StripeEvent): string | null {
  const obj = event.data.object;
  if (event.type.startsWith("checkout.session.")) return obj.id as string;
  const meta = obj.metadata as Record<string, string> | undefined;
  return meta?.session_id ?? null;
}

function extractPaymentIntentId(event: StripeEvent): string | null {
  const obj = event.data.object;
  if (event.type.startsWith("payment_intent.")) return obj.id as string;
  return (obj.payment_intent as string) ?? null;
}

async function processWithRetry(db: SupabaseClient, event: StripeEvent): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await dispatchWebhookEvent(db, event);
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await logPaymentError(db, {
        event_id: event.id,
        error_message: message,
        retry_count: attempt + 1,
        source: "webhook",
      });
      if (attempt >= MAX_RETRIES - 1) throw e;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

async function dispatchWebhookEvent(db: SupabaseClient, event: StripeEvent): Promise<void> {
  const sessionId = extractSessionId(event);
  const paymentIntentId = extractPaymentIntentId(event);

  if (!WEBHOOK_EVENTS.has(event.type)) {
    await logStripeEvent(db, {
      event_id: event.id,
      type: event.type,
      session_id: sessionId,
      status: "ignored",
    });
    return;
  }

  if (sessionId && (await alreadyProcessedSession(db, sessionId)) && event.type !== "payment_intent.payment_failed") {
    await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId, status: "processed" });
    structuredLog(LOG_EVENTS.WEBHOOK_PROCESSED, { eventId: event.id, sessionId, skipped: true });
    return;
  }

  if (event.type === "checkout.session.created") {
    await handleSessionCreated(db, event.data.object);
  } else if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return;
    const sid = session.id as string;
    const metadata = session.metadata as Record<string, string> | undefined;
    const orderId = metadata?.order_id ?? (await resolveOrderIdForSession(db, sid));
    if (!orderId) return;
    await confirmPaymentFromWebhook(db, {
      orderId,
      sessionId: sid,
      paymentIntentId: (session.payment_intent as string) ?? paymentIntentId ?? undefined,
    });
  } else if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const metadata = intent.metadata as Record<string, string> | undefined;
    const sid = metadata?.session_id ?? sessionId;
    const orderId = metadata?.order_id ?? (sid ? await resolveOrderIdForSession(db, sid) : null);
    if (!orderId || !sid) return;
    await confirmPaymentFromWebhook(db, {
      orderId,
      sessionId: sid,
      paymentIntentId: intent.id as string,
    });
  } else if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const metadata = intent.metadata as Record<string, string> | undefined;
    await markPaymentFailed(db, {
      orderId: metadata?.order_id,
      sessionId: metadata?.session_id ?? sessionId ?? undefined,
      paymentIntentId: intent.id as string,
    });
  }

  await logStripeEvent(db, {
    event_id: event.id,
    type: event.type,
    session_id: sessionId,
    status: "processed",
  });
  structuredLog(LOG_EVENTS.WEBHOOK_PROCESSED, { eventId: event.id, type: event.type, sessionId });
}

/** Validate signature → claim event → return 200 fast → process async (caller responsibility). */
export async function handleStripeWebhook(
  db: SupabaseClient,
  event: StripeEvent,
  opts: { asyncProcess?: boolean } = {}
): Promise<"duplicate" | "accepted"> {
  structuredLog(LOG_EVENTS.WEBHOOK_RECEIVED, { eventId: event.id, type: event.type });

  const sessionId = extractSessionId(event);
  const claim = await claimStripeEvent(db, {
    event_id: event.id,
    type: event.type,
    session_id: sessionId,
  });

  if (claim === "duplicate") return "duplicate";

  const work = processWithRetry(db, event).catch(async (e) => {
    console.error("Webhook processing error:", e);
    await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId, status: "failed" });
    await logPaymentError(db, {
      event_id: event.id,
      session_id: sessionId ?? undefined,
      error_message: e instanceof Error ? e.message : String(e),
      retry_count: MAX_RETRIES,
      source: "webhook",
    });
  });

  if (opts.asyncProcess !== false) {
    void work;
  } else {
    await work;
  }

  return "accepted";
}
