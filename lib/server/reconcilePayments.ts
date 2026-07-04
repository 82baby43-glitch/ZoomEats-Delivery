import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmPaymentFromWebhook, logPaymentError, writePaymentAudit } from "./paymentEngine";
import { fetchWithRateLimitRetry, structuredLog, LOG_EVENTS } from "./stripeIdempotency";

type ReconcileResult = {
  checked: number;
  fixed: number;
  flagged: number;
  errors: string[];
};

/** Compare recent Stripe sessions with Supabase — only reconciliation may fix paid state besides webhook. */
export async function reconcilePayments(db: SupabaseClient, stripeKey: string): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, fixed: 0, flagged: 0, errors: [] };
  if (!stripeKey) return result;

  const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

  const stripeRes = await fetchWithRateLimitRetry(
    `https://api.stripe.com/v1/checkout/sessions?limit=50&created[gte]=${since}`,
    { headers: { Authorization: `Bearer ${stripeKey}` } },
    db
  );
  const payload = await stripeRes.json();
  const sessions = (payload.data as Array<Record<string, unknown>>) ?? [];

  for (const session of sessions) {
    result.checked += 1;
    const sessionId = session.id as string;
    const stripePaid = session.payment_status === "paid";
    const metadata = session.metadata as Record<string, string> | undefined;
    let orderId = metadata?.order_id ?? null;

    if (!orderId) {
      const { data: tx } = await db.from("payment_transactions").select("order_id, payment_status").eq("session_id", sessionId).maybeSingle();
      orderId = tx?.order_id ?? null;
    }

    if (!orderId) continue;

    const { data: order } = await db
      .from("orders")
      .select("payment_status, order_status")
      .eq("order_id", orderId)
      .maybeSingle();

    if (!order) continue;

    if (stripePaid && order.payment_status !== "paid") {
      try {
        const { updated } = await confirmPaymentFromWebhook(db, {
          orderId,
          sessionId,
          paymentIntentId: (session.payment_intent as string) ?? undefined,
          source: "reconciliation",
        });
        if (updated) {
          result.fixed += 1;
          await writePaymentAudit(db, {
            order_id: orderId,
            action: "reconciled_paid",
            source: "reconciliation",
            meta: { session_id: sessionId },
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`${sessionId}: ${msg}`);
        await logPaymentError(db, { order_id: orderId, session_id: sessionId, error_message: msg, source: "reconciliation" });
      }
    } else if (!stripePaid && order.payment_status === "paid") {
      result.flagged += 1;
      await logPaymentError(db, {
        order_id: orderId,
        session_id: sessionId,
        error_message: "Supabase paid but Stripe session not paid",
        source: "reconciliation",
      });
      structuredLog(LOG_EVENTS.ORDER_UPDATED, { orderId, sessionId, flagged: true, reason: "supabase_paid_stripe_not" });
    }
  }

  return result;
}
