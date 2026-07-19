"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import DeliveryFeeCalculator from "@/components/checkout/DeliveryFeeCalculator";
import { Truck } from "lucide-react";

export default function RestaurantDeliveryEstimate({ restaurantId, subtotal = 15 }) {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    setLoading(true);
    api
      .post("/pricing/delivery-estimate", { restaurant_id: restaurantId, subtotal })
      .then((res) => {
        if (!cancelled) setQuote(res?.data || null);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, subtotal]);

  const deliveryTotal = quote?.calculator?.delivery_total;
  const surge = quote?.surge_multiplier;

  return (
    <div className="card p-4" data-testid="restaurant-delivery-estimate">
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
        quote={quote ? { ...quote, customer_lines: quote.lines, customer: quote.customer, distance_miles: quote.distance_miles, surge_multiplier: quote.surge_multiplier, free_delivery: quote.free_delivery } : null}
        loading={loading}
        subtotalFallback={subtotal}
        showHeader={false}
        compact
      />
      <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
        Fees update at checkout based on your address, order size, and current demand.
      </p>
    </div>
  );
}
