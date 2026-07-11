"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { KeyRound } from "lucide-react";

export default function CustomerDeliveryPin({ orderId, status }) {
  const [pinData, setPinData] = useState(null);

  useEffect(() => {
    if (!orderId) return;
    if (!["arrived_at_customer", "picked_up", "out_for_delivery"].includes(status)) {
      setPinData(null);
      return;
    }
    (async () => {
      try {
        const res = await api.get(`/orders/${orderId}/delivery-pin`);
        setPinData(res?.data || res);
      } catch {
        setPinData({ pin_required: false });
      }
    })();
  }, [orderId, status]);

  if (!pinData?.pin_required) return null;

  return (
    <div className="card p-5 mt-6 border-2" style={{ borderColor: "var(--primary)" }} data-testid="customer-delivery-pin">
      <div className="flex items-center gap-2 font-display text-xl font-bold">
        <KeyRound size={20} /> Delivery PIN
      </div>
      <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
        Share this code with your driver when they arrive. It expires after delivery.
      </p>
      {pinData.pin ? (
        <div className="mt-4 text-4xl font-black tracking-[0.3em] text-center" data-testid="delivery-pin-value">
          {pinData.pin}
        </div>
      ) : (
        <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>{pinData.message || "PIN will appear when your driver arrives."}</p>
      )}
    </div>
  );
}
