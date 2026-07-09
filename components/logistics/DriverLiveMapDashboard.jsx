"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import LogisticsMap from "@/components/maps/LogisticsMap";
import { useLogisticsPoll, useLogisticsRealtime } from "@/lib/hooks/useLogisticsRealtime";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { formatMoney } from "@/lib/safeData";
import { MapPin, Navigation, DollarSign, Radio } from "lucide-react";
import DriverSafetyPanel from "@/components/logistics/DriverSafetyPanel";

const STATUS_LABELS = {
  offline: "Offline",
  online: "Online",
  available: "Available",
  en_route: "En Route",
  waiting: "Waiting",
  delivering: "Delivering",
  break: "Break",
};

export default function DriverLiveMapDashboard() {
  const [theme, setTheme] = useState("dark");
  const fetchDriver = useCallback(() => api.get("/logistics/driver"), []);
  const { data, loading, error, reload } = useLogisticsPoll(fetchDriver, "driver");

  useLogisticsRealtime({
    role: "driver",
    driverId: data?.position ? "active" : null,
    onRefresh: reload,
  });

  if (loading && !data) {
    return (
      <div>
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-12"><LoadingSkeleton label="Loading live map…" rows={4} /></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-12">
          <ErrorState title="Could not load logistics" onRetry={reload} />
        </div>
      </div>
    );
  }

  const status = data?.status || "offline";
  const hotspotMarkers = (data?.hotspots || []).map((h) => ({
    id: h.id,
    type: "hotspot",
    lat: h.lat,
    lng: h.lng,
    label: h.label,
    meta: { level: h.level },
  }));

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="label-eyebrow">Driver · Live logistics</div>
            <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight">Live Map Dashboard</h1>
            <p className="text-sm mt-1 flex items-center gap-2" style={{ color: "var(--muted)" }}>
              <Radio size={14} className={status !== "offline" ? "text-green-500" : ""} />
              {STATUS_LABELS[status] || status}
              {data?.eta_min ? ` · ETA ${data.eta_min} min` : ""}
              {data?.remaining_distance_km ? ` · ${data.remaining_distance_km} km left` : ""}
            </p>
          </div>
          <Link href="/driver/dashboard" className="btn-secondary text-sm">Classic dashboard</Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <LogisticsMap
              markers={[...(data?.markers || []), ...hotspotMarkers]}
              routes={data?.routes || []}
              theme={theme}
              height={480}
              onThemeChange={setTheme}
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="card p-3 text-center">
                <div className="text-xs" style={{ color: "var(--muted)" }}>Speed</div>
                <div className="font-bold">{data?.speed_kmh ?? 0} km/h</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-xs" style={{ color: "var(--muted)" }}>Distance</div>
                <div className="font-bold">{data?.remaining_distance_km ?? 0} km</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-xs" style={{ color: "var(--muted)" }}>ETA</div>
                <div className="font-bold">{data?.eta_min ?? "—"} min</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-xs" style={{ color: "var(--muted)" }}>Queue</div>
                <div className="font-bold">{data?.queue?.length ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <h2 className="font-bold flex items-center gap-2 mb-3"><DollarSign size={16} /> Live Earnings</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Today <strong>${formatMoney(data?.earnings?.today)}</strong></div>
                <div>Week <strong>${formatMoney(data?.earnings?.week)}</strong></div>
                <div>Tips <strong>${formatMoney(data?.earnings?.tips)}</strong></div>
                <div>$/hr <strong>${formatMoney(data?.earnings?.effective_hourly)}</strong></div>
                <div>Done <strong>{data?.earnings?.deliveries_completed ?? 0}</strong></div>
                <div>Online <strong>{data?.earnings?.online_minutes ?? 0}m</strong></div>
              </div>
            </div>

            <div className="card p-4">
              <h2 className="font-bold mb-3">Delivery Queue</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(data?.queue || []).length === 0 && (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>No active deliveries</p>
                )}
                {(data?.queue || []).map((q) => (
                  <div key={q.order_id} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }} data-testid={`queue-${q.order_id}`}>
                    <div className="font-bold">{q.restaurant_name}</div>
                    <div style={{ color: "var(--muted)" }}>{q.customer_name} · {q.distance_km} km</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <span className="badge">Pay ~${formatMoney(q.estimated_pay)}</span>
                      <span className="badge">Tip ~${formatMoney(q.estimated_tip)}</span>
                      <span className="badge">ETA {q.eta_min}m</span>
                      <span className="badge">{q.prep_status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(data?.dispatch || []).length > 0 && (
              <div className="card p-4">
                <h2 className="font-bold flex items-center gap-2 mb-2"><Navigation size={16} /> Dispatch</h2>
                {data.dispatch.slice(0, 1).map((d) => (
                  <div key={d.order_id} className="text-sm space-y-1" style={{ color: "var(--muted)" }}>
                    <div>Score <strong>{d.dispatch_score}</strong> · Confidence {(d.confidence * 100).toFixed(0)}%</div>
                    <div>Rest {d.restaurant_distance_pct}% · Driver {d.driver_distance_pct}% · Wait {d.predicted_wait_pct}%</div>
                    <div className="text-xs">{d.reason}</div>
                  </div>
                ))}
              </div>
            )}

            <DriverSafetyPanel
              position={data?.position}
              activeOrderId={data?.queue?.[0]?.order_id}
            />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-4">
            <h2 className="font-bold mb-3 flex items-center gap-2"><MapPin size={16} /> Smart Hotspots</h2>
            <div className="flex flex-wrap gap-2">
              {(data?.hotspots || []).map((h) => (
                <span key={h.id} className={`badge ${h.level === "high" ? "ring-2 ring-[var(--primary)]" : ""}`}>
                  {h.label} ({h.level})
                </span>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <h2 className="font-bold mb-3">Performance</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Rating <strong>{data?.performance?.customer_rating}</strong></div>
              <div>On-time <strong>{data?.performance?.on_time_pct}%</strong></div>
              <div>Avg delivery <strong>{data?.performance?.avg_delivery_min}m</strong></div>
              <div>Streak <strong>{data?.performance?.current_streak}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
