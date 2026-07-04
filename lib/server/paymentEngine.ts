import type { SupabaseClient } from "@supabase/supabase-js";
import { structuredLog, LOG_EVENTS, memoryMarkProcessed } from "./stripeIdempotency";

/** Strict payment state machine — only webhook + reconciliation may write paid/failed/refunded. */
export const PaymentStatus = {
  PENDING: "pending",
  REQUIRES_PAYMENT: "requires_payment",
  PROCESSING: "processing",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;

export const OrderStatus = {
  CREATED: "created",
  AWAITING_PAYMENT: "awaiting_payment",
  CONFIRMED: "confirmed",
  PREPARING: "preparing",
  DISPATCHED: "dispatched",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export const WEBHOOK_EVENTS = new Set([
  "checkout.session.created",
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
]);

export async function writePaymentAudit(
  db: SupabaseClient,
  row: { order_id: string; action: string; source: string; meta?: Record<string, unknown> }
) {
  await db.from("payment_audit_log").insert({
    order_id: row.order_id,
    action: row.action,
    source: row.source,
    meta: row.meta ?? {},
    created_at: new Date().toISOString(),
  });
}

export async function logPaymentError(
  db: SupabaseClient,
  row: {
    event_id?: string;
    order_id?: string;
    session_id?: string;
    error_message: string;
    retry_count?: number;
    source?: string;
  }
) {
  await db.from("payment_error_logs").insert({
    event_id: row.event_id ?? null,
    order_id: row.order_id ?? null,
    session_id: row.session_id ?? null,
    error_message: row.error_message,
    retry_count: row.retry_count ?? 0,
    source: row.source ?? "webhook",
    created_at: new Date().toISOString(),
  });
}

export async function lockCheckoutSession(
  db: SupabaseClient,
  row: { session_id: string; order_id: string; status?: string }
): Promise<"locked" | "duplicate"> {
  const { data: existing } = await db
    .from("stripe_checkout_sessions")
    .select("session_id, order_id")
    .eq("order_id", row.order_id)
    .maybeSingle();

  if (existing && existing.session_id !== row.session_id) {
    return "duplicate";
  }

  const { error } = await db.from("stripe_checkout_sessions").upsert(
    {
      session_id: row.session_id,
      order_id: row.order_id,
      status: row.status ?? "created",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" }
  );

  if (error) return "duplicate";
  return "locked";
}

/** Webhook: checkout.session.created — mark order awaiting payment, never paid. */
export async function handleSessionCreated(
  db: SupabaseClient,
  session: Record<string, unknown>
): Promise<void> {
  const sessionId = session.id as string;
  const metadata = session.metadata as Record<string, string> | undefined;
  let orderId = metadata?.order_id;

  if (!orderId) {
    const { data: locked } = await db
      .from("stripe_checkout_sessions")
      .select("order_id")
      .eq("session_id", sessionId)
      .maybeSingle();
    orderId = locked?.order_id;
  }

  if (!orderId) {
    const { data: tx } = await db.from("payment_transactions").select("order_id").eq("session_id", sessionId).maybeSingle();
    orderId = tx?.order_id;
  }

  if (!orderId) return;

  await lockCheckoutSession(db, { session_id: sessionId, order_id: orderId, status: "created" });

  await db
    .from("orders")
    .update({
      payment_status: PaymentStatus.REQUIRES_PAYMENT,
      order_status: OrderStatus.AWAITING_PAYMENT,
      status: "pending_payment",
      stripe_session_id: sessionId,
    })
    .eq("order_id", orderId)
    .neq("payment_status", PaymentStatus.PAID);

  await db
    .from("payment_transactions")
    .update({ payment_status: PaymentStatus.REQUIRES_PAYMENT, status: "created" })
    .eq("session_id", sessionId)
    .neq("payment_status", PaymentStatus.PAID);

  await writePaymentAudit(db, {
    order_id: orderId,
    action: "session_created",
    source: "webhook",
    meta: { session_id: sessionId },
  });
}

/**
 * ONLY path to mark an order paid — Stripe webhook or reconciliation job.
 * Race-safe: UPDATE ... WHERE payment_status != 'paid'
 */
export async function confirmPaymentFromWebhook(
  db: SupabaseClient,
  opts: {
    orderId: string;
    sessionId: string;
    paymentIntentId?: string;
    source?: string;
  }
): Promise<{ updated: boolean }> {
  const { orderId, sessionId, paymentIntentId, source = "webhook" } = opts;
  const now = new Date().toISOString();

  const { data: updated } = await db
    .from("orders")
    .update({
      payment_status: PaymentStatus.PAID,
      order_status: OrderStatus.CONFIRMED,
      status: "placed",
      confirmed_at: now,
      stripe_session_id: sessionId,
    })
    .eq("order_id", orderId)
    .neq("payment_status", PaymentStatus.PAID)
    .select("order_id")
    .maybeSingle();

  if (!updated) {
    structuredLog(LOG_EVENTS.ORDER_UPDATED, { orderId, sessionId, skipped: true, reason: "already_paid" });
    memoryMarkProcessed(`sess:${sessionId}`);
    return { updated: false };
  }

  await db
    .from("payment_transactions")
    .update({ payment_status: PaymentStatus.PAID, status: "complete" })
    .eq("session_id", sessionId)
    .neq("payment_status", PaymentStatus.PAID);

  await db
    .from("stripe_checkout_sessions")
    .update({ status: "complete", payment_intent_id: paymentIntentId ?? null, updated_at: now })
    .eq("session_id", sessionId);

  memoryMarkProcessed(`sess:${sessionId}`);
  structuredLog(LOG_EVENTS.ORDER_UPDATED, { orderId, sessionId, updated: true, source });

  await writePaymentAudit(db, {
    order_id: orderId,
    action: "paid",
    source,
    meta: { session_id: sessionId, payment_intent_id: paymentIntentId },
  });

  return { updated: true };
}

export async function markPaymentFailed(
  db: SupabaseClient,
  opts: { orderId?: string; sessionId?: string; paymentIntentId?: string; source?: string }
): Promise<void> {
  const { orderId, sessionId, paymentIntentId, source = "webhook" } = opts;
  let resolvedOrderId = orderId;

  if (!resolvedOrderId && sessionId) {
    const { data: tx } = await db.from("payment_transactions").select("order_id").eq("session_id", sessionId).maybeSingle();
    resolvedOrderId = tx?.order_id;
  }

  if (resolvedOrderId) {
    await db
      .from("orders")
      .update({
        payment_status: PaymentStatus.FAILED,
        order_status: OrderStatus.CANCELLED,
      })
      .eq("order_id", resolvedOrderId)
      .neq("payment_status", PaymentStatus.PAID);

    await writePaymentAudit(db, {
      order_id: resolvedOrderId,
      action: "failed",
      source,
      meta: { session_id: sessionId, payment_intent_id: paymentIntentId },
    });
  }

  if (sessionId) {
    await db
      .from("payment_transactions")
      .update({ payment_status: PaymentStatus.FAILED })
      .eq("session_id", sessionId)
      .neq("payment_status", PaymentStatus.PAID);

    await db
      .from("stripe_checkout_sessions")
      .update({ status: "failed", payment_intent_id: paymentIntentId ?? null, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  }
}

export async function resolveOrderIdForSession(db: SupabaseClient, sessionId: string): Promise<string | null> {
  const { data: locked } = await db.from("stripe_checkout_sessions").select("order_id").eq("session_id", sessionId).maybeSingle();
  if (locked?.order_id) return locked.order_id;

  const { data: tx } = await db.from("payment_transactions").select("order_id").eq("session_id", sessionId).maybeSingle();
  return tx?.order_id ?? null;
}
