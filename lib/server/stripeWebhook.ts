import type { SupabaseClient } from "@supabase/supabase-js";
import { fulfillPaidOrder } from "./fulfillPaidOrder";
import { isEventProcessed, markEventProcessed } from "./stripeIdempotency";

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
]);

function safeStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeMeta(obj: Record<string, unknown> | null | undefined): Record<string, string> {
  const meta = obj?.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  return meta as Record<string, string>;
}

async function resolveOrderId(
  db: SupabaseClient,
  opts: { orderId?: string | null; sessionId?: string | null; metadata?: Record<string, string> }
): Promise<string | null> {
  const fromMeta = safeStr(opts.metadata?.order_id);
  if (fromMeta) return fromMeta;
  if (opts.orderId) return opts.orderId;
  if (!opts.sessionId) return null;

  const { data: tx } = await db
    .from("payment_transactions")
    .select("order_id")
    .eq("session_id", opts.sessionId)
    .maybeSingle();

  const fromTx = safeStr(tx?.order_id);
  if (fromTx) return fromTx;

  const { data: order } = await db
    .from("orders")
    .select("order_id")
    .eq("stripe_session_id", opts.sessionId)
    .maybeSingle();

  return safeStr(order?.order_id);
}

async function markOrderPaid(
  db: SupabaseClient,
  opts: {
    orderId: string;
    sessionId?: string | null;
    paymentIntentId?: string | null;
    amountPaid?: number | null;
    currency?: string | null;
  }
) {
  await fulfillPaidOrder(db, {
    orderId: opts.orderId,
    sessionId: opts.sessionId,
    paymentIntentId: opts.paymentIntentId,
    amountPaid: opts.amountPaid,
    currency: opts.currency,
  });
}

async function markOrderFailed(db: SupabaseClient, orderId: string) {
  const { data: existing } = await db
    .from("orders")
    .select("order_id, payment_status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!existing || existing.payment_status === "paid") return;

  await db
    .from("orders")
    .update({
      payment_status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .neq("payment_status", "paid");
}

/** Verify signature → process synchronously → return when done. */
export async function handleStripeWebhook(db: SupabaseClient, event: StripeEvent): Promise<void> {
  if (await isEventProcessed(db, event.id)) return;

  const obj = event.data?.object;
  if (!obj || typeof obj !== "object") return;

  const meta = safeMeta(obj);
  const sessionId = event.type.startsWith("checkout.session.")
    ? safeStr(obj.id)
    : safeStr(meta.session_id);
  const paymentIntentId =
    safeStr(obj.payment_intent) ?? (event.type.startsWith("payment_intent.") ? safeStr(obj.id) : null);

  console.log(
    JSON.stringify({
      event_type: event.type,
      order_id: meta.order_id ?? null,
      session_id: sessionId,
      payment_intent_id: paymentIntentId,
    })
  );

  if (!HANDLED_EVENTS.has(event.type)) return;

  let orderId: string | null = null;

  if (event.type === "checkout.session.completed") {
    if (obj.payment_status !== "paid") return;
    orderId = await resolveOrderId(db, { orderId: meta.order_id, sessionId: safeStr(obj.id), metadata: meta });
    if (!orderId) return;
    await markOrderPaid(db, {
      orderId,
      sessionId: safeStr(obj.id),
      paymentIntentId: safeStr(obj.payment_intent),
      amountPaid: typeof obj.amount_total === "number" ? obj.amount_total / 100 : null,
      currency: safeStr(obj.currency),
    });
  } else if (event.type === "payment_intent.succeeded") {
    orderId = await resolveOrderId(db, { orderId: meta.order_id, sessionId: meta.session_id, metadata: meta });
    if (!orderId) return;
    await markOrderPaid(db, {
      orderId,
      sessionId: meta.session_id ?? null,
      paymentIntentId: safeStr(obj.id),
      amountPaid: typeof obj.amount === "number" ? obj.amount / 100 : null,
      currency: safeStr(obj.currency),
    });
  } else if (event.type === "payment_intent.payment_failed") {
    orderId = await resolveOrderId(db, { orderId: meta.order_id, sessionId: meta.session_id, metadata: meta });
    if (!orderId) return;
    await markOrderFailed(db, orderId);
  }

  await markEventProcessed(db, {
    event_id: event.id,
    type: event.type,
    order_id: orderId,
    session_id: sessionId,
    payment_intent_id: paymentIntentId,
  });
}
