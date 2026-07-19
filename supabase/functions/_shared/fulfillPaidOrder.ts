import type { SupabaseClient } from "@supabase/supabase-js";

export type FulfillPaidOrderInput = {
  orderId: string;
  sessionId?: string | null;
  paymentIntentId?: string | null;
  amountPaid?: number | null;
  currency?: string | null;
};

export type FulfillPaidOrderResult = {
  updated: boolean;
  alreadyFulfilled: boolean;
  orderId: string;
};

function safeStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Mark paid and advance order into placed/confirmed (fires dispatch trigger). */
export async function fulfillPaidOrder(
  db: SupabaseClient,
  input: FulfillPaidOrderInput
): Promise<FulfillPaidOrderResult> {
  const { data: existing } = await db
    .from("orders")
    .select("order_id, payment_status, status, order_status")
    .eq("order_id", input.orderId)
    .maybeSingle();

  if (!existing) {
    console.error(JSON.stringify({ error: "fulfill_order_not_found", order_id: input.orderId }));
    return { updated: false, alreadyFulfilled: false, orderId: input.orderId };
  }

  const alreadyFulfilled =
    existing.payment_status === "paid" &&
    existing.status !== "pending_payment" &&
    existing.status !== "pending";

  if (alreadyFulfilled) {
    return { updated: false, alreadyFulfilled: true, orderId: input.orderId };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    payment_status: "paid",
    status: "placed",
    order_status: "confirmed",
    confirmed_at: now,
    updated_at: now,
    webhook_processed_at: now,
  };

  const sessionId = safeStr(input.sessionId);
  const paymentIntentId = safeStr(input.paymentIntentId);
  if (sessionId) patch.stripe_session_id = sessionId;
  if (paymentIntentId) patch.stripe_payment_intent_id = paymentIntentId;
  if (input.amountPaid != null) patch.amount_paid = input.amountPaid;
  if (input.currency) patch.currency = input.currency;

  const { error: updateError } = await db
    .from("orders")
    .update(patch)
    .eq("order_id", input.orderId)
    .in("status", ["pending_payment", "pending", "placed", "confirmed"]);

  if (updateError) {
    console.error(
      JSON.stringify({
        error: "fulfill_order_update_failed",
        order_id: input.orderId,
        message: updateError.message,
      })
    );
    return { updated: false, alreadyFulfilled: false, orderId: input.orderId };
  }

  if (sessionId) {
    await db
      .from("payment_transactions")
      .update({ payment_status: "paid", status: "complete" })
      .eq("session_id", sessionId)
      .neq("payment_status", "paid");
  }

  console.log(
    JSON.stringify({
      event: "order_fulfilled",
      order_id: input.orderId,
      session_id: sessionId,
      payment_intent_id: paymentIntentId,
    })
  );

  return { updated: true, alreadyFulfilled: false, orderId: input.orderId };
}
