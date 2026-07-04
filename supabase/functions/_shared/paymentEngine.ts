import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { structuredLog, LOG_EVENTS, memoryMarkProcessed, fetchWithRateLimitRetry } from "./stripeIdempotency.ts";

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
  row: { event_id?: string; order_id?: string; session_id?: string; error_message: string; retry_count?: number; source?: string }
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
  const { data: existing } = await db.from("stripe_checkout_sessions").select("session_id, order_id").eq("order_id", row.order_id).maybeSingle();
  if (existing && existing.session_id !== row.session_id) return "duplicate";
  const { error } = await db.from("stripe_checkout_sessions").upsert(
    { session_id: row.session_id, order_id: row.order_id, status: row.status ?? "created", updated_at: new Date().toISOString() },
    { onConflict: "session_id" }
  );
  if (error) {
    if (error.code !== "42P01") return "duplicate";
  }
  return "locked";
}

export async function handleSessionCreated(db: SupabaseClient, session: Record<string, unknown>) {
  const sessionId = session.id as string;
  const metadata = session.metadata as Record<string, string> | undefined;
  let orderId = metadata?.order_id;
  if (!orderId) {
    const { data: tx } = await db.from("payment_transactions").select("order_id").eq("session_id", sessionId).maybeSingle();
    orderId = tx?.order_id;
  }
  if (!orderId) return;
  await lockCheckoutSession(db, { session_id: sessionId, order_id: orderId, status: "created" });
  await db.from("orders").update({
    payment_status: PaymentStatus.REQUIRES_PAYMENT,
    order_status: OrderStatus.AWAITING_PAYMENT,
    status: "pending_payment",
    stripe_session_id: sessionId,
  }).eq("order_id", orderId).neq("payment_status", PaymentStatus.PAID);
  await writePaymentAudit(db, { order_id: orderId, action: "session_created", source: "webhook", meta: { session_id: sessionId } });
}

export async function confirmPaymentFromWebhook(
  db: SupabaseClient,
  opts: { orderId: string; sessionId: string; paymentIntentId?: string; source?: string }
) {
  const { orderId, sessionId, paymentIntentId, source = "webhook" } = opts;
  const now = new Date().toISOString();
  const { data: updated } = await db.from("orders").update({
    payment_status: PaymentStatus.PAID,
    order_status: OrderStatus.CONFIRMED,
    status: "placed",
    confirmed_at: now,
    stripe_session_id: sessionId,
  }).eq("order_id", orderId).neq("payment_status", PaymentStatus.PAID).select("order_id").maybeSingle();

  if (!updated) {
    memoryMarkProcessed(`sess:${sessionId}`);
    return { updated: false };
  }
  await db.from("payment_transactions").update({ payment_status: PaymentStatus.PAID, status: "complete" }).eq("session_id", sessionId).neq("payment_status", PaymentStatus.PAID);
  await db.from("stripe_checkout_sessions").update({ status: "complete", payment_intent_id: paymentIntentId ?? null, updated_at: now }).eq("session_id", sessionId);
  memoryMarkProcessed(`sess:${sessionId}`);
  structuredLog(LOG_EVENTS.ORDER_UPDATED, { orderId, sessionId, updated: true, source });
  await writePaymentAudit(db, { order_id: orderId, action: "paid", source, meta: { session_id: sessionId, payment_intent_id: paymentIntentId } });
  return { updated: true };
}

export async function markPaymentFailed(db: SupabaseClient, opts: { orderId?: string; sessionId?: string; paymentIntentId?: string; source?: string }) {
  let orderId = opts.orderId;
  if (!orderId && opts.sessionId) {
    const { data: tx } = await db.from("payment_transactions").select("order_id").eq("session_id", opts.sessionId).maybeSingle();
    orderId = tx?.order_id;
  }
  if (orderId) {
    await db.from("orders").update({ payment_status: PaymentStatus.FAILED, order_status: OrderStatus.CANCELLED }).eq("order_id", orderId).neq("payment_status", PaymentStatus.PAID);
    await writePaymentAudit(db, { order_id: orderId, action: "failed", source: opts.source ?? "webhook", meta: { session_id: opts.sessionId } });
  }
  if (opts.sessionId) {
    await db.from("payment_transactions").update({ payment_status: PaymentStatus.FAILED }).eq("session_id", opts.sessionId).neq("payment_status", PaymentStatus.PAID);
  }
}

export async function resolveOrderIdForSession(db: SupabaseClient, sessionId: string): Promise<string | null> {
  const { data: locked } = await db.from("stripe_checkout_sessions").select("order_id").eq("session_id", sessionId).maybeSingle();
  if (locked?.order_id) return locked.order_id;
  const { data: tx } = await db.from("payment_transactions").select("order_id").eq("session_id", sessionId).maybeSingle();
  return tx?.order_id ?? null;
}

/** Verify with Stripe API, then sync via confirmPaymentFromWebhook (webhook fallback / local dev). */
export async function confirmPaymentFromStripeSession(
  db: SupabaseClient,
  opts: { sessionId: string; stripeKey: string; userId: string; devMode?: boolean }
): Promise<{
  payment_status: string;
  confirmed: boolean;
  order_id?: string;
  stripe_payment_status?: string;
}> {
  const { sessionId, stripeKey, userId, devMode } = opts;

  const { data: tx } = await db.from("payment_transactions").select("*").eq("session_id", sessionId).maybeSingle();
  if (!tx) throw Object.assign(new Error("Checkout session not found"), { status: 404 });

  const { data: order } = await db
    .from("orders")
    .select("order_id, customer_id, payment_status")
    .eq("order_id", tx.order_id)
    .maybeSingle();

  if (!order || order.customer_id !== userId) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  if (order.payment_status === PaymentStatus.PAID || tx.payment_status === PaymentStatus.PAID) {
    return { payment_status: PaymentStatus.PAID, confirmed: true, order_id: order.order_id };
  }

  if (devMode && sessionId.startsWith("cs_test_")) {
    await confirmPaymentFromWebhook(db, { orderId: order.order_id, sessionId, source: "dev_confirm" });
    return { payment_status: PaymentStatus.PAID, confirmed: true, order_id: order.order_id };
  }

  if (!stripeKey) {
    throw Object.assign(new Error("Stripe is not configured"), { status: 503 });
  }

  const r = await fetchWithRateLimitRetry(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
    { headers: { Authorization: `Bearer ${stripeKey}` } },
    db
  );
  const stripeSession = await r.json();
  if (!r.ok) {
    throw Object.assign(new Error(stripeSession.error?.message || "Stripe error"), { status: 500 });
  }

  if (stripeSession.payment_status === "paid") {
    await confirmPaymentFromWebhook(db, {
      orderId: order.order_id,
      sessionId,
      paymentIntentId: stripeSession.payment_intent as string | undefined,
      source: "stripe_verify",
    });
    return {
      payment_status: PaymentStatus.PAID,
      confirmed: true,
      order_id: order.order_id,
      stripe_payment_status: stripeSession.payment_status,
    };
  }

  return {
    payment_status: order.payment_status ?? tx.payment_status ?? PaymentStatus.PROCESSING,
    confirmed: false,
    order_id: order.order_id,
    stripe_payment_status: stripeSession.payment_status,
  };
}
