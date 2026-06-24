import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useRealtimeRow } from "@/lib/useRealtime";
import Header from "@/components/Header";
import { CheckCircle2, Circle, ExternalLink, MapPin, Truck, Clock, Wifi } from "lucide-react";

const TIMELINE = [
  { id: "placed", label: "Placed" },
  { id: "accepted", label: "Accepted by restaurant" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready for pickup" },
  { id: "assigned_internal", label: "Driver assigned" },
  { id: "assigned_uber", label: "Uber driver assigned" },
  { id: "picked_up", label: "Out for delivery" },
  { id: "delivered", label: "Delivered" },
];

function timelineIndex(status) {
  // collapse the two "assigned_*" into a single conceptual step
  if (status === "assigned_uber" || status === "assigned_internal") return 4;
  const i = TIMELINE.findIndex((t) => t.id === status);
  return i === 5 ? 4 : i; // map index back for display
}

function fmtEta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", weekday: "short" });
}

export default function OrderDetail() {
  const { oid } = useParams();
  const [data, setData] = useState(null);
  const [pulse, setPulse] = useState(0); // little visual indicator when realtime fires

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/orders/${oid}/tracking`);
      setData(r.data);
    } catch (e) {
      console.warn("[order-detail] tracking load failed:", e);
    }
  }, [oid]);

  useEffect(() => { load(); }, [load]);

  // Realtime: when the order row updates → reload tracking
  const onChange = useCallback(() => {
    setPulse((p) => p + 1);
    load();
  }, [load]);

  useRealtimeRow("orders", "order_id", oid, onChange);
  useRealtimeRow("deliveries", "order_id", oid, onChange);
  useRealtimeRow("drivers", "driver_id", data?.driver?.driver_id, onChange);

  // Fallback polling (5s) in case Realtime channel hiccups
  useEffect(() => {
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return <div><Header /><div className="p-12 text-center">Loading…</div></div>;
  const o = data.order;
  const idx = timelineIndex(o.status);
  const isUber = data.delivery_type === "uber";
  const isInternal = data.delivery_type === "internal";
  const display = TIMELINE.filter((t) => !(isUber && t.id === "assigned_internal") && !(isInternal && t.id === "assigned_uber"));
  const eta = data.delivery?.eta;
  const trackingUrl = data.delivery?.meta?.tracking_url;

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-12">
        <div className="flex items-center gap-2">
          <div className="label-eyebrow">Order #{o.order_id.slice(-6)}</div>
          <span
            className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md"
            style={{ background: "var(--surface-2)", color: pulse > 0 ? "var(--primary)" : "var(--muted)" }}
            data-testid="realtime-indicator"
            title={pulse > 0 ? `${pulse} realtime updates received` : "Awaiting events"}
          >
            <Wifi size={12} /> Live
          </span>
        </div>
        <h1 className="font-display text-4xl font-black tracking-tighter mt-1">{o.restaurant_name}</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>
          {o.address} · ${o.total.toFixed(2)} · {o.payment_status}
        </p>

        {/* Live delivery banner */}
        {data.delivery_type && (
          <div className="card p-5 mt-6 flex items-center gap-4" data-testid="delivery-banner">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--primary)", color: "#0A0A0A" }}
            >
              <Truck size={22} />
            </div>
            <div className="flex-1">
              <div className="font-bold">
                {isUber ? "Uber Direct" : "ZoomEats Driver"} · {o.status.replace("_", " ")}
              </div>
              <div className="text-sm flex items-center gap-3 mt-1" style={{ color: "var(--muted)" }}>
                {eta && <span className="flex items-center gap-1"><Clock size={14} /> ETA {fmtEta(eta)}</span>}
                {data.driver?.latitude && (
                  <span className="flex items-center gap-1">
                    <MapPin size={14} /> driver @ {data.driver.latitude.toFixed(3)}, {data.driver.longitude.toFixed(3)}
                  </span>
                )}
              </div>
            </div>
            {trackingUrl && (
              <a
                className="btn-primary !py-2 flex items-center gap-2"
                href={trackingUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="uber-tracking-link"
              >
                Track on Uber <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}

        <div className="card p-6 mt-6">
          <h3 className="font-display text-xl font-bold mb-4">Status</h3>
          <ol className="space-y-3" data-testid="order-timeline">
            {display.map((t, i) => {
              const done = i <= idx && o.status !== "pending_payment";
              return (
                <li key={t.id} className="flex items-center gap-3">
                  {done ? <CheckCircle2 size={20} style={{ color: "var(--primary)" }} /> : <Circle size={20} style={{ color: "var(--border)" }} />}
                  <span className={done ? "font-bold" : ""} style={{ color: done ? "var(--text)" : "var(--muted)" }}>
                    {t.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="card p-6 mt-6">
          <h3 className="font-display text-xl font-bold mb-4">Items</h3>
          {o.items.map((it) => (
            <div key={it.item_id} className="flex justify-between py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <span>{it.quantity}× {it.name}</span>
              <span>${(it.price * it.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between mt-4 font-display font-bold text-lg">
            <span>Total</span>
            <span>${o.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
