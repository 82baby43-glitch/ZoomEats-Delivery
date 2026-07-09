"use client";

import { Mic, Navigation, CheckCircle2, Package } from "lucide-react";
import { useVoiceCommands } from "@/lib/hooks/useVoiceCommands";

export default function DriverSafetyMode({
  enabled,
  onAcceptOrder,
  onStartNavigation,
  onArrivedRestaurant,
  onDelivered,
}) {
  const { listening, lastHeard } = useVoiceCommands(enabled, {
    onAcceptOrder,
    onStartNavigation,
    onArrivedRestaurant,
    onDelivered,
  });

  if (!enabled) return null;

  return (
    <div className="card p-4 mb-6" data-testid="driver-safety-mode" style={{ borderColor: "var(--accent)" }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="label-eyebrow">Safety Mode</div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Large controls + voice commands while driving
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
          style={{ background: listening ? "rgba(34,197,94,0.15)" : "var(--surface-2)", color: listening ? "#4ade80" : "var(--muted)" }}
        >
          <Mic size={12} /> {listening ? "Listening" : "Voice off"}
        </span>
      </div>

      {lastHeard && (
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>Heard: “{lastHeard}”</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-primary !py-4 !text-base min-h-[56px]" onClick={onAcceptOrder}>
          <Package size={20} className="inline mr-2" />
          Accept order
        </button>
        <button type="button" className="btn-secondary !py-4 !text-base min-h-[56px]" onClick={onStartNavigation}>
          <Navigation size={20} className="inline mr-2" />
          Navigation
        </button>
        <button type="button" className="btn-secondary !py-4 !text-base min-h-[56px]" onClick={onArrivedRestaurant}>
          At restaurant
        </button>
        <button type="button" className="btn-primary !py-4 !text-base min-h-[56px]" onClick={onDelivered}>
          <CheckCircle2 size={20} className="inline mr-2" />
          Delivered
        </button>
      </div>

      <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
        Say: “Accept order”, “Start navigation”, “Arrived at restaurant”, or “Delivered”
      </p>
    </div>
  );
}
