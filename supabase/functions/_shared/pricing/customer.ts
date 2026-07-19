import type { PricingQuote } from "./types";
import { FEE_HELP_TEXT } from "./checkoutInsights.ts";

export type CustomerPricingLine = {
  key: string;
  label: string;
  amount: number;
  isDiscount?: boolean;
  isTotal?: boolean;
  meta?: string;
  helpText?: string;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function deliveryStackTotal(customer: PricingQuote["customer"]): number {
  return round2(
    customer.delivery_fee +
      customer.distance_fee +
      customer.surge_fee +
      customer.weather_fee +
      customer.small_order_fee
  );
}

/** Transparent checkout line items — only non-zero fees (except Items and Total). */
export function formatCustomerPricingLines(
  quote: PricingQuote,
  opts: { promoCode?: string | null; freeDeliveryApplied?: boolean } = {}
): CustomerPricingLine[] {
  const c = quote.customer;
  const lines: CustomerPricingLine[] = [];

  lines.push({
    key: "subtotal",
    label: "Items",
    amount: c.subtotal,
    helpText: FEE_HELP_TEXT.subtotal,
  });

  if (c.discount_amount > 0) {
    const label = opts.freeDeliveryApplied
      ? "Free delivery"
      : opts.promoCode
        ? `Promo code savings (${opts.promoCode})`
        : "Discounts";
    lines.push({
      key: "discount",
      label,
      amount: -c.discount_amount,
      isDiscount: true,
      helpText: FEE_HELP_TEXT.discount,
    });
  }

  if (c.delivery_fee > 0) {
    lines.push({
      key: "delivery_base",
      label: "Base delivery fee",
      amount: c.delivery_fee,
      helpText: FEE_HELP_TEXT.delivery_base,
    });
  }
  if (c.distance_fee > 0) {
    lines.push({
      key: "distance_fee",
      label: `Distance fee (${quote.distance_miles.toFixed(1)} mi)`,
      amount: c.distance_fee,
      helpText: FEE_HELP_TEXT.distance_fee,
    });
  }
  if (c.small_order_fee > 0) {
    lines.push({
      key: "small_order_fee",
      label: "Small order fee",
      amount: c.small_order_fee,
      helpText: FEE_HELP_TEXT.small_order_fee,
    });
  }
  if (c.surge_fee > 0) {
    lines.push({
      key: "surge_fee",
      label: `Busy area / surge fee (${quote.surge_multiplier}x)`,
      amount: c.surge_fee,
      meta: "High demand",
      helpText: FEE_HELP_TEXT.surge_fee,
    });
  }
  if (c.weather_fee > 0) {
    lines.push({
      key: "weather_fee",
      label: "Weather adjustment",
      amount: c.weather_fee,
      helpText: FEE_HELP_TEXT.weather_fee,
    });
  }
  if (c.service_fee > 0) {
    lines.push({
      key: "service_fee",
      label: "Service fee",
      amount: c.service_fee,
      helpText: FEE_HELP_TEXT.service_fee,
    });
  }
  const regulatory = Number(c.regulatory_fee ?? 0);
  if (regulatory > 0) {
    lines.push({
      key: "regulatory_fee",
      label: "Regulatory fee",
      amount: regulatory,
      helpText: FEE_HELP_TEXT.regulatory_fee,
    });
  }
  if (c.tip_amount > 0) {
    lines.push({
      key: "tip",
      label: "Driver tip",
      amount: c.tip_amount,
      helpText: FEE_HELP_TEXT.tip,
    });
  }
  if (c.tax_amount > 0) {
    lines.push({
      key: "tax",
      label: "Sales tax",
      amount: c.tax_amount,
      helpText: FEE_HELP_TEXT.tax,
    });
  }

  lines.push({
    key: "total",
    label: "Total",
    amount: c.customer_total,
    isTotal: true,
    helpText: FEE_HELP_TEXT.total,
  });
  return lines;
}

export function summarizeDeliveryCalculator(quote: PricingQuote) {
  const stack = deliveryStackTotal(quote.customer);
  return {
    distance_miles: quote.distance_miles,
    surge_multiplier: quote.surge_multiplier,
    base_delivery_fee: quote.customer.delivery_fee,
    distance_fee: quote.customer.distance_fee,
    surge_fee: quote.customer.surge_fee,
    small_order_fee: quote.customer.small_order_fee,
    service_fee: quote.customer.service_fee,
    delivery_total: stack,
    customer_total: quote.customer.customer_total,
    free_delivery_eligible: quote.free_delivery?.eligible ?? false,
    free_delivery_reason: quote.free_delivery?.reason ?? null,
  };
}
