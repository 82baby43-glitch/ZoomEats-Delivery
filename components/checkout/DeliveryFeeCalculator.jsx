"use client";

import IntelligentCheckoutPricing from "@/components/checkout/IntelligentCheckoutPricing";

/** @deprecated Use IntelligentCheckoutPricing — kept for restaurant detail estimates. */
export default function DeliveryFeeCalculator(props) {
  return <IntelligentCheckoutPricing {...props} />;
}
