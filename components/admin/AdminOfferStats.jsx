"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const LABELS = {
  offer_sent: "Offer sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  no_drivers_available: "No drivers",
};

export default function AdminOfferStats({ orderId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      try {
        const res = await api.get(`/admin/orders/${orderId}/offer-stats`);
        setData(res?.data || res);
      } catch {
        setData(null);
      }
    })();
  }, [orderId]);

  if (!data?.offers?.length) return null;

  return (
    <div className="text-xs space-y-2 mt-2 p-3 rounded-lg" style={{ background: "var(--surface-2)" }} data-testid={`admin-offer-stats-${orderId}`}>
      <div className="font-bold">Driver offer stats</div>
      {data.avg_acceptance_ms != null && (
        <div style={{ color: "var(--muted)" }}>Avg acceptance: {(data.avg_acceptance_ms / 1000).toFixed(1)}s</div>
      )}
      <ul className="space-y-1">
        {(data.events || []).slice(0, 8).map((ev) => (
          <li key={ev.event_id} className="flex justify-between gap-2">
            <span>{LABELS[ev.event_type] || ev.event_type}</span>
            <span style={{ color: "var(--muted)" }}>{new Date(ev.created_at).toLocaleTimeString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
