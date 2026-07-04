import type { SupabaseClient } from "@supabase/supabase-js";
import { isEventProcessed, markEventProcessed } from "./stripeIdempotency";

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

/** Verify signature → process synchronously → return when done. */
export async function handleStripeWebhook(db: SupabaseClient, event: StripeEvent): Promise<void> {
  if (await isEventProcessed(db, event.id)) {
    console.log(JSON.stringify({ event_type: event.type, skipped: "duplicate_event_id" }));
    return;
  }

  const obj = event.data.object;
  const sessionId = event.type.startsWith("checkout.session.") ? (obj.id as string) : null;
  const paymentIntentId = (obj.payment_intent as string) ?? (event.type.startsWith("payment_intent.") ? (obj.id as string) : null);

  console.log(
    JSON.stringify({
      event_type: event.type,
      order_id: (obj.metadata as Record<string, string> | undefined)?.order_id ?? null,
      session_id: sessionId,
      payment_intent_id: paymentIntentId,
    })
  );

  if (event.type === "checkout.session.completed") {
    const session = obj;
    if (session.payment_status !== "paid") return;

    const metadata = session.metadata as Record<string, string> | undefined;
    const orderId = metadata?.order_id;
    const sid = session.id as string;
    if (!orderId) return;

    await db
      .from("orders")
      .update({
        payment_status: "paid",
        order_status: "confirmed",
        status: "placed",
        stripe_session_id: sid,
      })
      .eq("order_id", orderId);

    await db
      .from("payment_transactions")
      .update({ payment_status: "paid", status: "complete" })
      .eq("session_id", sid);
  }

  await markEventProcessed(db, {
    event_id: event.id,
    type: event.type,
    session_id: sessionId,
    payment_intent_id: paymentIntentId,
  });
}
