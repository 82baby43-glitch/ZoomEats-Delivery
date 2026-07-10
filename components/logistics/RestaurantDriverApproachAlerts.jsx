"use client";

import { MapPin, Truck, Clock, Navigation } from "lucide-react";

function formatLocation(lat, lng) {
  if (lat == null || lng == null) return "—";
  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
}

export default function RestaurantDriverApproachAlerts({ alerts = [] }) {
  if (!alerts.length) return null;

  return (
    <div className="space-y-3 mb-6" data-testid="restaurant-approach-alerts">
      {alerts.map((alert) => (
        <div
          key={`${alert.order_id}-${alert.phase}`}
          className="card p-4 border-2"
          style={{
            borderColor: alert.phase === "arrived" ? "var(--primary)" : "var(--accent)",
            background: alert.phase === "arrived" ? "var(--surface-2)" : undefined,
          }}
          data-testid={`approach-alert-${alert.phase}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="label-eyebrow flex items-center gap-2">
                <Truck size={14} />
                Order #{String(alert.order_id).slice(-6)}
              </div>
              <h2 className="font-display text-xl font-black tracking-tight mt-1">
                {alert.message}
              </h2>
            </div>
            <span
              className="badge capitalize"
              style={alert.phase === "arrived" ? { background: "var(--primary)", color: "#0A0A0A" } : undefined}
            >
              {alert.phase === "arrived" ? "At restaurant" : `${alert.distance_feet} ft`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Driver</div>
              <div className="font-bold">{alert.driver_name}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Vehicle</div>
              <div className="font-bold">{alert.vehicle_type}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--muted)" }}>
                <MapPin size={12} /> Live location
              </div>
              <div className="font-mono text-xs mt-0.5">{formatLocation(alert.driver_lat, alert.driver_lng)}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--muted)" }}>
                <Clock size={12} /> ETA
              </div>
              <div className="font-bold flex items-center gap-1">
                <Navigation size={14} />
                {alert.eta_pickup_min != null ? `~${alert.eta_pickup_min} min` : "Updating…"}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
