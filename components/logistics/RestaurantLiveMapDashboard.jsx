"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import LogisticsMap from "@/components/maps/LogisticsMap";
import RestaurantDriverApproachAlerts from "@/components/logistics/RestaurantDriverApproachAlerts";
import { useLogisticsPoll, useLogisticsRealtime } from "@/lib/hooks/useLogisticsRealtime";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { formatMoney } from "@/lib/safeData";
import { ChefHat, Truck, TrendingUp, Bell, MapPin, Clock } from "lucide-react";

export default function RestaurantLiveMapDashboard() {
  const [theme, setTheme] = useState("dark");
  const fetchRestaurant = useCallback(() => api.get("/logistics/restaurant"), []);
  const { data, loading, error, reload } = useLogisticsPoll(fetchRestaurant, "restaurant", 6000);

  useLogisticsRealtime({
    role: "restaurant",
    restaurantId: data?.restaurant?.restaurant_id,
    onRefresh: reload,
  });

  const pauseStore = async (pause) => {
    await api.post("/vendor/restaurant", { accepting_orders: !pause });
    await reload();
  };

  if (loading && !data) {
    return (
      <div>
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-12"><LoadingSkeleton label="Loading kitchen map…" rows={4} /></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-12">
          <ErrorState title="Could not load restaurant logistics" onRetry={reload} />
        </div>
      </div>
    );
  }

  const hotspotMarkers = (data?.heatmap_zones || []).map((h) => ({
    id: h.id,
    type: "hotspot",
    lat: h.lat,
    lng: h.lng,
    label: h.label,
    meta: { level: h.level },
  }));

  const otherArrivals = (data?.arrivals || []).filter(
    (a) => !(data?.approach_alerts || []).some((p) => p.order_id === a.order_id && p.message === a.message)
  );

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="label-eyebrow">Restaurant · Live logistics</div>
            <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight">{data?.restaurant?.name || "Kitchen"} Map</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {data?.active_orders?.length ?? 0} active orders · realtime driver tracking
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/vendor" className="btn-secondary text-sm">Classic dashboard</Link>
            <button type="button" className="btn-secondary text-sm" onClick={() => pauseStore(true)} data-testid="pause-store">Pause store</button>
            <button type="button" className="btn-primary text-sm" onClick={() => pauseStore(false)} data-testid="resume-store">Resume store</button>
          </div>
        </div>

        <RestaurantDriverApproachAlerts alerts={data?.approach_alerts} />

        {otherArrivals.length > 0 && (
          <div className="card p-3 mb-4 flex flex-wrap gap-2">
            <Bell size={16} />
            {otherArrivals.map((a) => (
              <span key={`${a.order_id}-${a.message}`} className={`badge ${a.severity === "warning" ? "ring-2 ring-[var(--primary)]" : ""}`}>
                {a.message}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <LogisticsMap
              markers={[...(data?.markers || []), ...hotspotMarkers]}
              routes={data?.routes || []}
              theme={theme}
              height={480}
              onThemeChange={setTheme}
            />
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <h2 className="font-bold flex items-center gap-2 mb-3"><ChefHat size={16} /> Performance</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Avg prep <strong>{data?.performance?.avg_prep_min}m</strong></div>
                <div>Late <strong>{data?.performance?.late_orders}</strong></div>
                <div>Today <strong>${formatMoney(data?.performance?.daily_revenue)}</strong></div>
                <div>Week <strong>${formatMoney(data?.performance?.weekly_revenue)}</strong></div>
              </div>
            </div>
            <div className="card p-4">
              <h2 className="font-bold flex items-center gap-2 mb-2"><TrendingUp size={16} /> Insights</h2>
              <ul className="text-sm space-y-2" style={{ color: "var(--muted)" }}>
                {(data?.insights || []).map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2"><Truck size={18} /> Active Delivery Board</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(data?.active_orders || []).map((o) => (
              <div
                key={o.order_id}
                className="card p-4"
                data-testid={`restaurant-order-${o.order_id}`}
                style={o.approach_alert ? { borderColor: "var(--primary)", borderWidth: 2 } : undefined}
              >
                {o.approach_alert && (
                  <div className="mb-3 p-2 rounded-lg text-sm font-bold" style={{ background: "var(--surface-2)" }}>
                    {o.approach_alert.message}
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-bold">{o.customer_name}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>
                      {o.driver_name} · {o.vehicle_type || "Car"} · ${formatMoney(o.order_value)}
                    </div>
                  </div>
                  <span className="badge capitalize">{o.live_status}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  {o.eta_pickup_min != null && <span className="badge flex items-center gap-1"><Clock size={12} /> Pickup {o.eta_pickup_min}m</span>}
                  {o.eta_delivery_min != null && <span className="badge">Delivery {o.eta_delivery_min}m</span>}
                  {o.driver_distance_feet != null && (
                    <span className="badge flex items-center gap-1"><MapPin size={12} /> {o.driver_distance_feet} ft</span>
                  )}
                  {o.driver_lat != null && (
                    <span className="badge font-mono">{Number(o.driver_lat).toFixed(3)}, {Number(o.driver_lng).toFixed(3)}</span>
                  )}
                  <span className="badge">Prep {o.prep_timer_min}m</span>
                  {o.delay_warning && <span className="badge ring-2 ring-[var(--primary)]">{o.delay_warning}</span>}
                </div>
                <ol className="mt-3 flex flex-wrap gap-1">
                  {o.timeline.map((t) => (
                    <li key={t.step} className={`text-[10px] px-1.5 py-0.5 rounded ${t.done ? "bg-[var(--accent)]/20" : "opacity-40"}`}>
                      {t.step}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {(data?.active_orders || []).length === 0 && (
              <div className="card p-8 text-center col-span-full" style={{ color: "var(--muted)" }}>No active orders on the map.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
