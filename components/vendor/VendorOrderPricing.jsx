"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { RestaurantOrderBreakdown } from "@/components/pricing/OrderPricingBreakdown";
import { logClientError } from "@/lib/clientErrorLog";

export default function VendorOrderPricing({ orderId, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || breakdown || !orderId) return;
    setLoading(true);
    api
      .get(`/orders/${orderId}/pricing-breakdown`)
      .then((res) => setBreakdown(res?.data?.restaurant || null))
      .catch((e) => logClientError("vendor.orderPricing", e, { orderId }))
      .finally(() => setLoading(false));
  }, [open, breakdown, orderId]);

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        className="text-xs font-bold"
        style={{ color: "var(--primary)" }}
        onClick={() => setOpen((v) => !v)}
        data-testid={`vendor-payout-toggle-${orderId}`}
      >
        {open ? "Hide payout" : "View payout breakdown"}
      </button>
      {open && (
        <div className="mt-2">
          {loading && <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>}
          {breakdown && <RestaurantOrderBreakdown breakdown={breakdown} compact />}
          {!loading && !breakdown && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>Payout available after order is fulfilled.</p>
          )}
        </div>
      )}
    </div>
  );
}
