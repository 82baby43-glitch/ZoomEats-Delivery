"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DELIVERY_MODE_UI } from "@/lib/deliveryModes/constants";

export default function DeliveryModeStep({ onComplete, onBack }) {
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState([]);
  const [safetyAck, setSafetyAck] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/delivery-modes/catalog").then((r) => {
      setCatalog(r?.data?.modes || r?.modes || []);
    }).catch(() => {});
    api.get("/driver/fleet").then((r) => {
      const modes = r?.data?.approved_modes || r?.approved_modes || [];
      if (modes.length) setSelected(modes.map((m) => m.mode_key));
    }).catch(() => {});
  }, []);

  const toggle = (key) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const needsSafety = selected.some((k) => k === "bicycle" || k === "scooter");

  const submit = async () => {
    if (!selected.length) {
      alert("Select at least one delivery method");
      return;
    }
    if (needsSafety && !safetyAck) {
      alert("Please acknowledge the safety requirements");
      return;
    }
    setBusy(true);
    try {
      await api.post("/delivery-modes/onboarding", {
        modes: selected,
        safety_acknowledged: safetyAck,
      });
      onComplete?.(selected);
    } catch (e) {
      alert(e?.message || "Could not save delivery methods");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        How would you like to deliver with ZoomEats? You may select one or more methods if eligible.
      </p>

      <div className="space-y-3">
        {catalog.map((mode) => {
          const ui = DELIVERY_MODE_UI[mode.mode_key] || {};
          const isSelected = selected.includes(mode.mode_key);
          return (
            <button
              key={mode.mode_key}
              type="button"
              onClick={() => toggle(mode.mode_key)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                isSelected ? "border-[var(--accent)]" : "border-transparent"
              }`}
              style={{ background: "var(--surface-2)" }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{ui.icon || mode.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{ui.label || mode.label}</span>
                    {isSelected && <span className="text-xs text-green-400 font-medium">Selected</span>}
                  </div>
                  <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{ui.description}</p>
                  {ui.suitable_for?.length > 0 && (
                    <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                      Best for: {ui.suitable_for.join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {needsSafety && (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={safetyAck} onChange={(e) => setSafetyAck(e.target.checked)} className="mt-1" />
          <span>I acknowledge safety requirements for bicycle/scooter delivery and will follow all local traffic laws.</span>
        </label>
      )}

      <div className="flex gap-3 pt-2">
        {onBack && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={onBack}>Back</button>
        )}
        <button type="button" className="btn-primary flex-1" disabled={busy || !selected.length} onClick={submit}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
