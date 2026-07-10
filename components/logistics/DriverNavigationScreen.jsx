"use client";

import { useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { useLogisticsPoll, useLogisticsRealtime } from "@/lib/hooks/useLogisticsRealtime";
import { useRoutingRealtime } from "@/lib/hooks/useRoutingRealtime";
import { useDriverGpsTracking } from "@/lib/hooks/useDriverGpsTracking";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { Clock, MapPin, Navigation, FileText, Utensils, User } from "lucide-react";

const DriverNavigationMap = dynamic(
  () => import("@/components/logistics/DriverNavigationMap"),
  { ssr: false, loading: () => <div className="h-full min-h-[50vh] flex items-center justify-center" style={{ color: "var(--muted)" }}>Loading map…</div> }
);

const PHASE_LABELS = {
  to_restaurant: "Navigate to restaurant",
  to_customer: "Navigate to customer",
};

export default function DriverNavigationScreen() {
  const params = useParams();
  const orderId = Array.isArray(params?.oid) ? params.oid[0] : params?.oid;

  const fetchNav = useCallback(() => {
    const path = orderId
      ? `/logistics/driver/navigation/${orderId}`
      : "/logistics/driver/navigation";
    return api.get(path);
  }, [orderId]);

  const { data, loading, error, reload } = useLogisticsPoll(fetchNav, `driver-nav-${orderId || "active"}`, 12000);

  useLogisticsRealtime({
    role: "driver",
    driverId: data?.driver_id ?? null,
    onRefresh: reload,
  });

  useRoutingRealtime(data?.driver_id, reload);

  const hasActiveDelivery = Boolean(data?.order_id || orderId);
  useDriverGpsTracking({
    enabled: hasActiveDelivery,
    activeOrderId: data?.order_id ?? orderId,
    activeOrderStatus: data?.status ?? (orderId ? "assigned_internal" : null),
  });

  const destination = useMemo(() => {
    if (!data) return null;
    return data.phase === "to_customer" ? data.customer : data.restaurant;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 p-6"><LoadingSkeleton label="Loading navigation…" rows={4} /></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 p-6 max-w-lg mx-auto w-full">
          <ErrorState
            title="Navigation unavailable"
            description={
              orderId
                ? `Could not load navigation for order #${String(orderId).slice(-8)}. Confirm it is assigned to you and still active.`
                : "Accept or pick up an order to start navigation."
            }
            onRetry={reload}
          />
          <Link href="/driver/dashboard" className="btn-primary mt-4 inline-block text-sm">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" data-testid="driver-navigation-screen">
      <Header />
      <div className="flex flex-col lg:flex-row flex-1 min-h-[calc(100vh-64px)]">
        <div className="flex-1 min-h-[50vh] lg:min-h-[calc(100vh-64px)] relative">
          <DriverNavigationMap
            markers={data?.markers || []}
            routes={data?.routes || []}
            height="100%"
            className="absolute inset-0 min-h-[50vh] lg:min-h-[calc(100vh-64px)]"
          />
        </div>

        <aside
          className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l overflow-y-auto"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="p-5 space-y-5">
            <div>
              <div className="label-eyebrow flex items-center gap-2">
                <Navigation size={14} /> Driver Navigation
              </div>
              <h1 className="font-display text-2xl font-black tracking-tight mt-1">
                {PHASE_LABELS[data?.phase] || "Delivery"}
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                Order #{String(data?.order_id || "").slice(-8)}
              </p>
            </div>

            <div className="card p-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>ETA</div>
                <div className="font-display text-3xl font-black flex items-center gap-2" data-testid="nav-eta">
                  <Clock size={22} />
                  {data?.eta_min ?? "—"}<span className="text-lg">min</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Distance</div>
                <div className="font-bold text-lg mt-1">
                  {data?.remaining_distance_miles != null
                    ? `${data.remaining_distance_miles} mi`
                    : "—"}
                </div>
                {data?.speed_kmh != null && (
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{data.speed_kmh} km/h</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="card p-3">
                <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1 mb-1" style={{ color: "var(--muted)" }}>
                  <MapPin size={12} /> Your GPS
                </div>
                {data?.position ? (
                  <div className="font-mono text-xs">
                    {data.position.lat.toFixed(5)}, {data.position.lng.toFixed(5)}
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: "var(--muted)" }}>Waiting for GPS…</div>
                )}
              </div>

              <div className="card p-3">
                <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1 mb-1" style={{ color: "var(--muted)" }}>
                  <Utensils size={12} /> Restaurant
                </div>
                <div className="font-bold">{data?.restaurant?.name}</div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>{data?.restaurant?.address || "—"}</div>
              </div>

              <div className="card p-3">
                <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1 mb-1" style={{ color: "var(--muted)" }}>
                  <User size={12} /> Customer destination
                </div>
                <div className="font-bold">{data?.customer?.name}</div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>{data?.customer?.address || "—"}</div>
              </div>

              {destination && (
                <div className="card p-3 ring-2" style={{ borderColor: "var(--primary)" }}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--muted)" }}>
                    Next stop
                  </div>
                  <div className="font-bold">{destination.name || destination.address}</div>
                </div>
              )}
            </div>

            {(data?.delivery_notes || []).length > 0 && (
              <div className="card p-4">
                <h2 className="font-bold flex items-center gap-2 mb-3">
                  <FileText size={16} /> Delivery notes
                </h2>
                <ul className="space-y-2 text-sm" data-testid="delivery-notes">
                  {data.delivery_notes.map((note) => (
                    <li key={note} className="pl-3 border-l-2" style={{ borderColor: "var(--accent)" }}>
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link href="/driver/dashboard" className="btn-secondary text-sm flex-1 text-center">Dashboard</Link>
              <Link href="/driver/live-map" className="btn-secondary text-sm flex-1 text-center">Live map</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
