"use client";

import { useMemo } from "react";
import { Car, CheckCircle2, Circle } from "lucide-react";
import LogisticsMap from "@/components/maps/LogisticsMap";

const STATUS_STEPS = [
  { id: "picking_up", label: "Picking Up Food" },
  { id: "en_route", label: "En Route" },
  { id: "arriving_soon", label: "Arriving Soon" },
];

function stepIndex(liveStatus) {
  const i = STATUS_STEPS.findIndex((s) => s.id === liveStatus);
  if (liveStatus === "delivered") return STATUS_STEPS.length;
  if (liveStatus === "pending") return -1;
  return i >= 0 ? i : 1;
}

export default function CustomerLiveMapDashboard({ logistics, driverName }) {
  const routing = logistics?.routing;
  const markers = logistics?.markers || [];
  const routes = logistics?.routes || [];
  const idx = stepIndex(routing?.live_status);
  const etaText = routing?.eta_message || "Driver is on the way";
  const name = routing?.driver_name || driverName || "Driver";

  const showDashboard = useMemo(() => {
    if (!routing) return false;
    return !["pending", "delivered"].includes(routing.live_status);
  }, [routing]);

  if (!showDashboard) return null;

  return (
    <div className="card p-5 mt-6 space-y-4" data-testid="customer-live-map-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label-eyebrow">Live Map Dashboard</div>
          <h2 className="font-display text-2xl font-black tracking-tight flex items-center gap-2">
            <Car size={22} style={{ color: "var(--primary)" }} />
            Driver En Route
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Driver</div>
            <div className="font-bold text-lg">{name}</div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>Status</div>
            <ol className="space-y-2" data-testid="delivery-status-steps">
              {STATUS_STEPS.map((step, i) => {
                const active = i === idx;
                const done = i < idx;
                return (
                  <li key={step.id} className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle2 size={18} style={{ color: "var(--primary)" }} />
                    ) : active ? (
                      <Circle size={18} style={{ color: "var(--primary)" }} fill="var(--primary)" fillOpacity={0.35} />
                    ) : (
                      <Circle size={18} style={{ color: "var(--border)" }} />
                    )}
                    <span className={active || done ? "font-bold" : ""} style={{ color: active || done ? "var(--text)" : "var(--muted)" }}>
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="card p-3" style={{ background: "var(--surface-2)" }}>
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>ETA</div>
            <div className="font-bold mt-1" data-testid="delivery-eta-message">
              {routing?.customer_eta_message || etaText}
            </div>
            {(routing?.remaining_distance_miles != null || routing?.current_speed_mph != null) && (
              <div className="grid grid-cols-1 gap-1 text-sm mt-3" style={{ color: "var(--muted)" }}>
                {routing.remaining_distance_miles != null && routing.remaining_distance_miles > 0 && (
                  <div data-testid="eta-distance">
                    Driver: <strong style={{ color: "var(--text)" }}>{routing.remaining_distance_miles} miles away</strong>
                  </div>
                )}
                {routing.current_speed_mph != null && routing.current_speed_mph > 0 && (
                  <div data-testid="eta-speed">
                    Current speed: <strong style={{ color: "var(--text)" }}>{routing.current_speed_mph} mph</strong>
                  </div>
                )}
                {routing.estimated_arrival_min != null && (
                  <div data-testid="eta-arrival">
                    Estimated arrival: <strong style={{ color: "var(--text)" }}>{routing.estimated_arrival_min} minutes</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <LogisticsMap
            markers={markers}
            routes={routes}
            theme="dark"
            height={280}
            showControls={false}
            enableClustering={false}
            animateMarkers
          />
        </div>
      </div>
    </div>
  );
}
