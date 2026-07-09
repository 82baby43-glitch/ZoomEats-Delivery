"use client";

import { useMemo } from "react";
import { Music, Clock, Bell } from "lucide-react";
import { useCompanionContext } from "./CompanionModeProvider";
import { formatMoney } from "@/lib/safeData";

const PREP_MINUTES = { placed: 15, accepted: 12, preparing: 8, ready: 0 };

export default function KitchenCompanion({ orders = [] }) {
  const { settings, audio } = useCompanionContext();

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status && !["delivered", "cancelled"].includes(o.status)),
    [orders]
  );

  return (
    <div className="space-y-4" data-testid="kitchen-companion">
      <div className="card p-5">
        <h2 className="font-display text-lg font-bold mb-3">Active Orders</h2>
        {activeOrders.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>No active orders in queue.</p>
        ) : (
          <div className="space-y-3">
            {activeOrders.map((o) => {
              const eta = PREP_MINUTES[o.status] ?? 10;
              return (
                <div key={o.order_id} className="flex items-start justify-between gap-3 p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                  <div>
                    <div className="font-bold text-sm">Order #{String(o.order_id).slice(-4)}</div>
                    <div className="text-xs capitalize" style={{ color: "var(--muted)" }}>{o.status}</div>
                    <div className="text-xs flex items-center gap-1 mt-1" style={{ color: "var(--muted)" }}>
                      <Clock size={12} /> ETA: {eta} min
                    </div>
                  </div>
                  <div className="text-right text-sm font-bold">${formatMoney(o.total)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
          <Music size={14} /> Kitchen Playlist
        </h3>
        {settings?.music_connected ? (
          <>
            <p className="text-sm font-bold">Playing: Kitchen Companion</p>
            <p className="text-xs capitalize" style={{ color: "var(--muted)" }}>
              via {settings.music_provider?.replace("_", " ") || "connected service"}
            </p>
            {audio.ducked && (
              <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "var(--primary)" }}>
                <Bell size={12} /> Incoming order alert — music lowered
              </p>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Connect a music service in Companion settings to play while you prep.
          </p>
        )}
      </div>
    </div>
  );
}
