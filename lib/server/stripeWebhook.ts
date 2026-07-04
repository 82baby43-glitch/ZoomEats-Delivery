import type { SupabaseClient } from "@supabase/supabase-js";
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

  return safeStr(tx?.order_id) ?? null;
}

async function markOrderPaid(
  db: SupabaseClient,
  opts: { orderId: string; sessionId?: string | null; paymentIntentId?: string | null }
) {
  const { data: existing } = await db
    .from("orders")
    .select("order_id, payment_status")
    .eq("order_id", opts.orderId)
    .maybeSingle();

  if (!existing || existing.payment_status === "paid") return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    payment_status: "paid",
    updated_at: now,
  };

  const sessionId = safeStr(opts.sessionId);
  const paymentIntentId = safeStr(opts.paymentIntentId);
  if (sessionId) patch.stripe_session_id = sessionId;
  if (paymentIntentId) patch.stripe_payment_intent_id = paymentIntentId;

  const { error: updateError } = await db
    .from("orders")
    .update(patch)
    .eq("order_id", opts.orderId)
    .neq("payment_status", "paid");

  if (updateError) return;

  if (sessionId) {
    await db
      .from("payment_transactions")
      .update({ payment_status: "paid", status: "complete" })
      .eq("session_id", sessionId)
      .neq("payment_status", "paid");
  }
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

  if (event.type === "checkout.session.completed") {
    if (obj.payment_status !== "paid") return;
    const orderId = await resolveOrderId(db, { orderId: meta.order_id, sessionId: safeStr(obj.id), metadata: meta });
    if (!orderId) return;
    await markOrderPaid(db, {
      orderId,
      sessionId: safeStr(obj.id),
      paymentIntentId: safeStr(obj.payment_intent),
    });
  } else if (event.type === "payment_intent.succeeded") {
    const orderId = await resolveOrderId(db, { orderId: meta.order_id, sessionId: meta.session_id, metadata: meta });
    if (!orderId) return;
    await markOrderPaid(db, { orderId, sessionId: meta.session_id ?? null, paymentIntentId: safeStr(obj.id) });
  } else if (event.type === "payment_intent.payment_failed") {
    const orderId = await resolveOrderId(db, { orderId: meta.order_id, sessionId: meta.session_id, metadata: meta });
    if (!orderId) return;
    await markOrderFailed(db, orderId);
  }

  await markEventProcessed(db, {
    event_id: event.id,
    type: event.type,
    session_id: sessionId,
    payment_intent_id: paymentIntentId,
  });
}
