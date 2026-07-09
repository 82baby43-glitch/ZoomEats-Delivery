"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DELIVERY_MODE_UI, MODE_MAP_ICONS, VEHICLE_MODES } from "@/lib/deliveryModes/constants";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
  return diff;
}

function ExpiryBadge({ label, dateStr }) {
  const days = daysUntil(dateStr);
  if (days == null) return null;
  const urgent = days <= 14;
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${urgent ? "bg-amber-500/20 text-amber-300" : "bg-green-500/10 text-green-300"}`}>
      {label}: {days <= 0 ? "Expired" : `${days}d`}
    </span>
  );
}

export default function VehicleCenter({ compact = false }) {
  const [fleet, setFleet] = useState(null);
  const [earnings, setEarnings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ mode_key: "car", make: "", model: "", year: "", color: "", license_plate: "", insurance_expires_at: "", registration_expires_at: "" });

  const load = useCallback(async () => {
    try {
      const [f, e] = await Promise.all([
        api.get("/driver/fleet"),
        api.get("/driver/fleet/earnings"),
      ]);
      setFleet(f?.data || f);
      setEarnings(e?.data?.by_mode || e?.by_mode || []);
    } catch (err) {
      console.warn("[VehicleCenter]", err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const switchMode = async (modeKey) => {
    setBusy(true);
    try {
      await api.post("/driver/fleet/switch-mode", { mode_key: modeKey });
      await load();
    } catch (e) {
      alert(e?.message || "Could not switch mode");
    } finally {
      setBusy(false);
    }
  };

  const saveVehicle = async () => {
    setBusy(true);
    try {
      await api.post("/driver/fleet/vehicles", { ...vehicleForm, is_active: true });
      setShowVehicleForm(false);
      await load();
    } catch (e) {
      alert(e?.message || "Could not save vehicle");
    } finally {
      setBusy(false);
    }
  };

  if (!fleet) {
    return <div className="card p-4 text-sm" style={{ color: "var(--muted)" }}>Loading vehicle center…</div>;
  }

  const activeMode = fleet.active_delivery_mode || "car";
  const activeUi = DELIVERY_MODE_UI[activeMode] || {};
  const approvedModes = (fleet.approved_modes || []).filter((m) => m.approval_status === "approved" || m.approval_status === "pending");
  const activeVehicle = (fleet.vehicles || []).find((v) => v.vehicle_id === fleet.active_vehicle_id)
    || (fleet.vehicles || []).find((v) => v.is_active);

  return (
    <div className={`card ${compact ? "p-4" : "p-6"} space-y-5`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="label-eyebrow">Vehicle Center</div>
          <h2 className="font-display text-xl font-bold mt-1">Delivery Mode</h2>
        </div>
        <span className="text-3xl">{MODE_MAP_ICONS[activeMode] || "🚗"}</span>
      </div>

      <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
        <div className="text-sm" style={{ color: "var(--muted)" }}>Current Mode</div>
        <div className="font-bold text-lg mt-1">{activeUi.label || activeMode}</div>
        <div className="flex flex-wrap gap-2 mt-2">
          {approvedModes.map((m) => {
            const ui = DELIVERY_MODE_UI[m.mode_key] || {};
            const isActive = m.mode_key === activeMode;
            return (
              <button
                key={m.mode_key}
                type="button"
                disabled={busy || isActive}
                onClick={() => switchMode(m.mode_key)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${
                  isActive ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-transparent hover:border-white/20"
                }`}
                style={{ background: isActive ? undefined : "var(--surface)" }}
              >
                {ui.icon} {ui.label}
                {m.approval_status === "pending" && <span className="text-amber-400 ml-1">(pending)</span>}
              </button>
            );
          })}
        </div>
      </div>

      {VEHICLE_MODES.includes(activeMode) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm">Active Vehicle</h3>
            <button type="button" className="text-xs btn-ghost !py-1" onClick={() => setShowVehicleForm(!showVehicleForm)}>
              {showVehicleForm ? "Cancel" : "Add / Edit"}
            </button>
          </div>
          {activeVehicle ? (
            <div className="p-3 rounded-lg text-sm space-y-1" style={{ background: "var(--surface-2)" }}>
              <p className="font-medium">{activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
              <p style={{ color: "var(--muted)" }}>{activeVehicle.color} · {activeVehicle.license_plate}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <ExpiryBadge label="Insurance" dateStr={activeVehicle.insurance_expires_at} />
                <ExpiryBadge label="Registration" dateStr={activeVehicle.registration_expires_at} />
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted)" }}>No vehicle on file — add one to go online with this mode.</p>
          )}
          {showVehicleForm && (
            <div className="mt-3 space-y-2">
              <select className="input-field w-full" value={vehicleForm.mode_key} onChange={(e) => setVehicleForm((f) => ({ ...f, mode_key: e.target.value }))}>
                {VEHICLE_MODES.map((k) => <option key={k} value={k}>{DELIVERY_MODE_UI[k]?.label}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input className="input-field" placeholder="Make" value={vehicleForm.make} onChange={(e) => setVehicleForm((f) => ({ ...f, make: e.target.value }))} />
                <input className="input-field" placeholder="Model" value={vehicleForm.model} onChange={(e) => setVehicleForm((f) => ({ ...f, model: e.target.value }))} />
                <input className="input-field" placeholder="Year" type="number" value={vehicleForm.year} onChange={(e) => setVehicleForm((f) => ({ ...f, year: e.target.value }))} />
                <input className="input-field" placeholder="Color" value={vehicleForm.color} onChange={(e) => setVehicleForm((f) => ({ ...f, color: e.target.value }))} />
                <input className="input-field col-span-2" placeholder="License plate" value={vehicleForm.license_plate} onChange={(e) => setVehicleForm((f) => ({ ...f, license_plate: e.target.value }))} />
                <input className="input-field" type="date" placeholder="Insurance expiry" value={vehicleForm.insurance_expires_at} onChange={(e) => setVehicleForm((f) => ({ ...f, insurance_expires_at: e.target.value }))} />
                <input className="input-field" type="date" placeholder="Registration expiry" value={vehicleForm.registration_expires_at} onChange={(e) => setVehicleForm((f) => ({ ...f, registration_expires_at: e.target.value }))} />
              </div>
              <button type="button" className="btn-primary w-full" disabled={busy} onClick={saveVehicle}>Save Vehicle</button>
            </div>
          )}
        </div>
      )}

      {activeMode === "bicycle" && (
        <div className="text-sm p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
          <p className="font-medium">Bicycle Profile</p>
          {fleet.bicycle_profile ? (
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              {fleet.bicycle_profile.bike_type || "Standard"} ·
              {fleet.bicycle_profile.is_electric ? " E-bike" : " Manual"} ·
              {fleet.bicycle_profile.cargo_bag_capacity || "Standard capacity"}
            </p>
          ) : (
            <p className="mt-1" style={{ color: "var(--muted)" }}>Optional bike details can be added from onboarding.</p>
          )}
        </div>
      )}

      {!compact && earnings.length > 0 && (
        <div>
          <h3 className="font-bold text-sm mb-2">Earnings by Mode</h3>
          <div className="space-y-2">
            {earnings.map((s) => (
              <div key={s.mode_key} className="flex justify-between text-sm p-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <span>{MODE_MAP_ICONS[s.mode_key]} {DELIVERY_MODE_UI[s.mode_key]?.label || s.mode_key}</span>
                <span>{s.deliveries} trips · ${s.avg_earnings?.toFixed(2)}/avg</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
