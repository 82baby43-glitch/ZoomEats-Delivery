import type { PricingQuote } from "./types";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Tooltip copy explaining why each fee exists at checkout. */
export const FEE_HELP_TEXT: Record<string, string> = {
  subtotal: "The total price of items in your cart before fees and tax.",
  delivery_base: "Covers delivery distance and driver availability.",
  distance_fee: "Additional charge based on how far your order travels.",
  surge_fee: "Applied only during periods of unusually high demand.",
  small_order_fee: "Helps cover delivery costs on low-value orders.",
  service_fee: "Supports payment processing, customer support, and platform operations.",
  weather_fee: "Temporary adjustment for difficult delivery conditions.",
  tax: "Sales tax required for your delivery location.",
  regulatory_fee: "Local regulatory fee required for deliveries in your area.",
  discount: "Promotional savings applied to your order.",
  tip: "100% of your tip goes to your driver.",
  total: "Your final order total including all applicable fees.",
};

export type CheckoutInsights = {
  total_savings: number;
  savings_labels: string[];
  smart_messages: string[];
  free_delivery_gap: number | null;
  surge_active: boolean;
  peak_active: boolean;
};

/** Sum all promotional savings (discounts, free delivery value). */
export function computeCheckoutSavings(quote: PricingQuote): { total: number; labels: string[] } {
  const labels: string[] = [];
  let total = 0;

  if (quote.customer.discount_amount > 0) {
    total += quote.customer.discount_amount;
    if (quote.free_delivery?.eligible && quote.free_delivery.reason) {
      labels.push(quote.free_delivery.reason);
    } else {
      labels.push("Promo savings");
    }
  }

  return { total: round2(total), labels };
}

/** Contextual checkout nudges — never duplicate fee lines. */
export function buildCheckoutSmartMessages(
  quote: PricingQuote,
  opts: { freeDeliveryThreshold?: number; cartSubtotal?: number } = {}
): string[] {
  const messages: string[] = [];
  const subtotal = opts.cartSubtotal ?? quote.customer.subtotal;

  if (quote.blocked && quote.block_reason) {
    messages.push(quote.block_reason);
    return messages;
  }

  const threshold = opts.freeDeliveryThreshold ?? 0;
  if (
    threshold > 0 &&
    subtotal < threshold &&
    !quote.free_delivery?.eligible &&
    quote.customer.discount_amount === 0
  ) {
    const gap = round2(threshold - subtotal);
    if (gap > 0 && gap <= threshold) {
      messages.push(`Add $${gap.toFixed(2)} more to unlock free delivery.`);
    }
  }

  if (quote.surge_multiplier > 1.15) {
    messages.push("Demand is high. Ordering now may cost more.");
  } else if (quote.peak_active && quote.surge_multiplier <= 1.05) {
    messages.push("Lower fees are available during off-peak hours.");
  }

  if (quote.profit_protected) {
    messages.push("Fees were adjusted to keep this delivery available in your area.");
  }

  if (quote.estimated_drive_minutes > 0 && quote.estimated_drive_minutes <= 20) {
    messages.push("Restaurant is preparing your order quickly.");
  }

  return messages;
}

export function buildCheckoutInsights(
  quote: PricingQuote,
  opts: { freeDeliveryThreshold?: number; cartSubtotal?: number } = {}
): CheckoutInsights {
  const savings = computeCheckoutSavings(quote);
  const threshold = opts.freeDeliveryThreshold ?? 0;
  const subtotal = opts.cartSubtotal ?? quote.customer.subtotal;
  const freeDeliveryGap =
    threshold > 0 && subtotal < threshold && !quote.free_delivery?.eligible
      ? round2(threshold - subtotal)
      : null;

  return {
    total_savings: savings.total,
    savings_labels: savings.labels,
    smart_messages: buildCheckoutSmartMessages(quote, opts),
    free_delivery_gap: freeDeliveryGap,
    surge_active: quote.surge_multiplier > 1,
    peak_active: quote.peak_active,
  };
}
