import { safeString } from "./safeData";

/** Strict UI payment states — never assume paid without confirmed backend status. */
export const OrderState = {
  PENDING: "pending",
  PROCESSING_PAYMENT: "processing_payment",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
  UNKNOWN: "unknown",
} as const;

export type OrderStateValue = (typeof OrderState)[keyof typeof OrderState];

export function resolvePaymentState(order: { payment_status?: unknown; status?: unknown } | null | undefined): OrderStateValue {
  const paymentStatus = safeString(order?.payment_status, "pending");
  const status = safeString(order?.status, "");

  if (paymentStatus === "paid") return OrderState.PAID;
  if (paymentStatus === "refunded") return OrderState.REFUNDED;
  if (paymentStatus === "failed") return OrderState.FAILED;
  if (status === "pending_payment" || paymentStatus === "initiated" || paymentStatus === "pending") {
    return OrderState.PROCESSING_PAYMENT;
  }
  if (paymentStatus === "pending") return OrderState.PENDING;
  return OrderState.UNKNOWN;
}

export function isPaymentConfirmed(order: { payment_status?: unknown } | null | undefined): boolean {
  return safeString(order?.payment_status) === "paid";
}

export const PAYMENT_STATE_LABEL: Record<OrderStateValue, string> = {
  [OrderState.PENDING]: "Awaiting payment",
  [OrderState.PROCESSING_PAYMENT]: "Processing payment…",
  [OrderState.PAID]: "Paid",
  [OrderState.FAILED]: "Payment failed",
  [OrderState.REFUNDED]: "Refunded",
  [OrderState.UNKNOWN]: "Payment status unknown",
};

export function resolveCheckoutStatus(data: {
  payment_status?: unknown;
  status?: unknown;
  cached?: unknown;
  rate_limited?: unknown;
} | null | undefined): OrderStateValue {
  if (!data) return OrderState.UNKNOWN;
  const paymentStatus = safeString(data.payment_status);
  if (paymentStatus === "paid" || data.cached) return OrderState.PAID;
  if (paymentStatus === "failed") return OrderState.FAILED;
  if (data.status === "expired") return OrderState.FAILED;
  if (data.rate_limited) return OrderState.PROCESSING_PAYMENT;
  return OrderState.PROCESSING_PAYMENT;
}
