import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LOG_EVENTS,
  alreadyProcessedSession,
  logStripeEvent,
  markOrderPaidIfNeeded,
  structuredLog,
} from "./stripeIdempotency";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export async function processStripeWebhookEvent(db: SupabaseClient, event: StripeEvent): Promise<void> {
  const sessionId =
    event.type === "checkout.session.completed"
      ? (event.data.object.id as string)
      : (event.data.object.metadata as Record<string, string> | undefined)?.session_id ||
        (event.data.object as { id?: string }).id;

  if (sessionId && (await alreadyProcessedSession(db, sessionId))) {
    await logStripeEvent(db, {
      event_id: event.id,
      type: event.type,
      session_id: sessionId,
      status: "processed",
    });
    structuredLog(LOG_EVENTS.WEBHOOK_PROCESSED, { eventId: event.id, sessionId, skipped: true, reason: "session_done" });
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(db, event);
    } else if (event.type === "payment_intent.succeeded") {
      await handlePaymentIntentSucceeded(db, event);
    } else {
      await logStripeEvent(db, { event_id: event.id, type: event.type, session_id: sessionId ?? null, status: "ignored" });
      return;
    }

    await logStripeEvent(db, {
      event_id: event.id,
      type: event.type,
      session_id: sessionId ?? null,
      status: "processed",
    });
    structuredLog(LOG_EVENTS.WEBHOOK_PROCESSED, { eventId: event.id, type: event.type, sessionId });
  } catch (e) {
    await logStripeEvent(db, {
      event_id: event.id,
      type: event.type,
      session_id: sessionId ?? null,
      status: "failed",
    });
    throw e;
  }
}

async function handleCheckoutSessionCompleted(db: SupabaseClient, event: StripeEvent) {
  const session = event.data.object;
  const sessionId = session.id as string;
  const paymentStatus = session.payment_status as string;
  if (paymentStatus !== "paid") return;

  const orderId = (session.metadata as Record<string, string> | undefined)?.order_id;
  if (!orderId) {
    const { data: tx } = await db.from("payment_transactions").select("order_id").eq("session_id", sessionId).maybeSingle();
    if (!tx?.order_id) return;
    await markOrderPaidIfNeeded(db, {
      orderId: tx.order_id,
      sessionId,
      stripeSessionStatus: session.status as string,
    });
    return;
  }

  await markOrderPaidIfNeeded(db, {
    orderId,
    sessionId,
    stripeSessionStatus: session.status as string,
  });
}

async function handlePaymentIntentSucceeded(db: SupabaseClient, event: StripeEvent) {
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
    if (tx?.order_id) {
      await markOrderPaidIfNeeded(db, { orderId: tx.order_id, sessionId });
    }
  }
}
