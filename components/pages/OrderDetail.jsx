"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { safeGet } from "@/lib/api";
import { useRealtimeRow } from "@/lib/useRealtime";
import { useDeliveryRealtime } from "@/lib/hooks/useDeliveryRealtime";
import Header from "@/components/Header";
import CustomerLiveMapDashboard from "@/components/logistics/CustomerLiveMapDashboard";
import { CheckCircle2, Circle, ExternalLink, MapPin, Truck, Clock, Wifi } from "lucide-react";
import { formatMoney, safeNumber, safeOrderId, sanitizeOrder } from "@/lib/safeData";
import { PAYMENT_STATE_LABEL, resolvePaymentState } from "@/lib/orderState";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import CustomerDeliveryPin from "@/components/orders/CustomerDeliveryPin";

const TIMELINE = [
  { id: "placed", label: "Placed" },
  { id: "accepted", label: "Accepted by restaurant" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready for pickup" },
  { id: "assigned_internal", label: "Driver assigned" },
  { id: "assigned_uber", label: "Uber driver assigned" },
  { id: "arrived_at_store", label: "Driver at restaurant" },
  { id: "picked_up", label: "Out for delivery" },
  { id: "arrived_at_customer", label: "Driver arrived" },
  { id: "delivered", label: "Delivered" },
];

function timelineIndex(status) {
  if (status === "assigned_uber" || status === "assigned_internal") {
    return TIMELINE.findIndex((t) => t.id === status);
  }
  const i = TIMELINE.findIndex((t) => t.id === status);
  return i >= 0 ? i : 0;
}

function fmtEta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", weekday: "short" });
}

export default function OrderDetail() {
  const { oid } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pulse, setPulse] = useState(0);

  const load = useCallback(async () => {
    if (!oid) return;
    try {
      const raw = await safeGet(`/orders/${oid}/tracking`, null);
      if (raw && typeof raw === "object") {
        setData(raw);
        setError(false);
      } else {
        setError(true);
      }
    } catch (e) {
      logClientError("order-detail", e, { oid });
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [oid]);

  useEffect(() => { load(); }, [load]);

  const onChange = useCallback(() => {
    setPulse((p) => p + 1);
    load();
  }, [load]);

  useRealtimeRow("orders", "order_id", oid, onChange);
  useRealtimeRow("deliveries", "order_id", oid, onChange);
  useRealtimeRow("drivers", "driver_id", data?.driver?.driver_id, onChange);
  useRealtimeRow("driver_route_states", "driver_id", data?.driver?.driver_id, onChange);

  const onDeliveryEvent = useCallback((event, payload) => {
    setPulse((p) => p + 1);
    if (event === "driver_location_updated" && payload?.latitude != null) {
      setData((prev) => {
        if (!prev) return prev;
        const lat = Number(payload.latitude);
        const lng = Number(payload.longitude);
        const nextDriver = prev.driver
          ? { ...prev.driver, latitude: lat, longitude: lng }
          : prev.driver;
        const nextLogistics = prev.logistics
          ? {
              ...prev.logistics,
              markers: (prev.logistics.markers || []).map((m) =>
                m.type === "driver"
                  ? {
                      ...m,
                      lat,
                      lng,
                      meta: {
                        ...m.meta,
                        heading_deg: payload.heading ?? m.meta?.heading_deg,
                        speed_kmh: payload.speed != null ? Math.round(Number(payload.speed) * 3.6 * 10) / 10 : m.meta?.speed_kmh,
                      },
                    }
                  : m
              ),
            }
          : prev.logistics;
        return { ...prev, driver: nextDriver, logistics: nextLogistics, driver_location: payload };
      });
    } else {
      load();
    }
  }, [load]);

  useDeliveryRealtime(oid, onDeliveryEvent);

  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 md:px-12 py-12">
          <LoadingSkeleton label="Loading order…" rows={4} />
        </div>
      </div>
    );
  }

  if (error || !data?.order) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 md:px-12 py-12">
          <ErrorState title="Could not load order" description="This order may not exist or the connection failed." onRetry={load} />
        </div>
      </div>
    );
  }

  const o = sanitizeOrder(data.order);
  const idx = timelineIndex(o.status);
  const isUber = data.delivery_type === "uber";
  const isInternal = data.delivery_type === "internal";
  const display = TIMELINE.filter((t) => !(isUber && t.id === "assigned_internal") && !(isInternal && t.id === "assigned_uber"));
  const eta = data.delivery?.eta;
  const trackingUrl = data.delivery?.meta?.tracking_url;
  const paymentState = resolvePaymentState(o);
  const driverLat = safeNumber(data.driver?.latitude, NaN);
  const driverLng = safeNumber(data.driver?.longitude, NaN);

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-12">
        <div className="flex items-center gap-2">
          <div className="label-eyebrow">Order #{safeOrderId(o.order_id)}</div>
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
          {o.address || "—"} · ${formatMoney(o.total)} · {PAYMENT_STATE_LABEL[paymentState]}
        </p>

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
                {isUber ? "Uber Direct" : "ZoomEats Driver"} · {(o.status || "unknown").replace(/_/g, " ")}
              </div>
              <div className="text-sm flex items-center gap-3 mt-1" style={{ color: "var(--muted)" }}>
                {eta && <span className="flex items-center gap-1"><Clock size={14} /> ETA {fmtEta(eta)}</span>}
                {Number.isFinite(driverLat) && (
                  <span className="flex items-center gap-1">
                    <MapPin size={14} /> driver @ {driverLat.toFixed(3)}, {driverLng.toFixed(3)}
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

        {data.logistics ? (
          <CustomerLiveMapDashboard logistics={data.logistics} />
        ) : (data.restaurant?.latitude || data.customer?.latitude || data.driver?.latitude) ? (
          <div className="mt-6 text-sm" style={{ color: "var(--muted)" }}>
            Live map will appear when your driver is assigned.
          </div>
        ) : null}

        <CustomerDeliveryPin orderId={o.order_id} status={o.status} />

        {o.delivery_method && (
          <div className="card p-4 mt-6 text-sm">
            <div className="label-eyebrow">Delivery preference</div>
            <div className="font-bold mt-1">
              {o.delivery_method === "leave_at_door" ? "Leave at Door" : "Hand it to Me"}
            </div>
            {o.delivery_instructions && (
              <p className="mt-2" style={{ color: "var(--muted)" }}>{o.delivery_instructions}</p>
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
          {(o.items || []).length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>No items listed.</p>
          ) : (
            o.items.map((it) => (
              <div key={it.item_id || it.name} className="flex justify-between py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <span>{it.quantity}× {it.name}</span>
                <span>${formatMoney(it.price * it.quantity)}</span>
              </div>
            ))
          )}
          <div className="flex justify-between mt-4 font-display font-bold text-lg">
            <span>Total</span>
            <span>${formatMoney(o.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
