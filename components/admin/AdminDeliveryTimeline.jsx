"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LoadingSkeleton } from "@/components/ui/PageStates";

const LABELS = {
  driver_assigned: "Driver assigned",
  arrived_at_store: "Arrived at store",
  order_ready: "Order ready",
  picked_up: "Picked up",
  arrived_at_customer: "Arrived at customer",
  photo_uploaded: "Photo uploaded",
  pin_verified: "PIN verified",
  pin_failed: "PIN attempt failed",
  delivered: "Delivered",
};

export default function AdminDeliveryTimeline({ orderId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/admin/orders/${orderId}/delivery-timeline`);
        setData(res?.data || res);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  if (loading) return <LoadingSkeleton label="Loading delivery timeline…" rows={3} />;
  if (!data) return null;

  const o = data.order;
  const events = data.events || [];

  return (
    <div className="card p-4 mt-3 text-sm space-y-3" data-testid={`admin-delivery-timeline-${orderId}`}>
      <div className="font-bold">Delivery timeline</div>
      <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <div>Method: {o.delivery_method || "—"}</div>
        <div>GPS verified: {o.gps_verified ? "Yes" : "No"}</div>
        <div>Wait at store: {o.driver_arrived_at && o.restaurant_ready_at ? "tracked" : "—"}</div>
        <div>Duration: {o.delivery_duration ? `${o.delivery_duration} min` : "—"}</div>
      </div>
      <ol className="space-y-2">
        {events.map((ev) => (
          <li key={ev.event_id} className="flex justify-between gap-3 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <span className="font-medium">{LABELS[ev.event_type] || ev.event_type}</span>
            <span style={{ color: "var(--muted)" }}>{new Date(ev.created_at).toLocaleString()}</span>
          </li>
        ))}
        {events.length === 0 && <li style={{ color: "var(--muted)" }}>No delivery events yet.</li>}
      </ol>
    </div>
  );
}
