"use client";

import DeliveryFeeCalculator from "@/components/checkout/DeliveryFeeCalculator";
import { Truck } from "lucide-react";

export default function CheckoutPricingPanel({
  quote,
  loading = false,
  subtotalFallback = 0,
  hasAddress = false,
}) {
  const deliveryTotal = quote?.delivery_calculator?.delivery_total;
  const surge = quote?.surge_multiplier;

  return (
    <div data-testid="checkout-pricing-panel">
      <div className="flex items-center gap-2 mb-3">
        <Truck size={16} style={{ color: "var(--primary)" }} />
        <span className="font-bold text-sm">Delivery pricing</span>
        {!loading && deliveryTotal != null && (
          <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
            from ${Number(deliveryTotal).toFixed(2)}
            {surge > 1 ? ` · ${surge}x surge` : ""}
          </span>
        )}
      </div>
      <DeliveryFeeCalculator
        quote={quote}
        loading={loading}
        subtotalFallback={subtotalFallback}
        showHeader={false}
      />
      <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
        {hasAddress
          ? "Fees update at checkout based on your address, order size, and current demand."
          : "Enter your delivery address above for distance-based fees and surge pricing."}
      </p>
    </div>
  );
}
