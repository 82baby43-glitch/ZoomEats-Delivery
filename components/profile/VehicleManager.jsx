"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { VEHICLE_PHOTO_TYPES, VEHICLE_TYPES } from "@/lib/profiles/types";
import { processVehicleImage, uploadProcessedImage } from "@/lib/profiles/imageUtils";
import VehiclePlaceholder from "@/components/profile/VehiclePlaceholder";
import { Camera, Plus, Star, Trash2, Upload } from "lucide-react";

const EMPTY_FORM = {
  nickname: "",
  vehicle_type: "car",
  make: "",
  model: "",
  year: "",
  color: "",
  license_plate: "",
  fuel_type: "",
};

export default function VehicleManager({ compact = false }) {
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRefs = useRef(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/driver/vehicles");
      setVehicles(Array.isArray(r?.data?.vehicles) ? r.data.vehicles : []);
      setError("");
    } catch (e) {
      setError(e?.message || "Could not load vehicles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeVehicle = vehicles.find((v) => v.is_active) || vehicles[0] || null;

  const saveVehicle = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/driver/vehicles", {
        ...form,
        year: form.year ? Number(form.year) : null,
        is_active: vehicles.length === 0,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e?.message || "Could not save vehicle");
    } finally {
      setBusy(false);
    }
  };

  const activateVehicle = async (vehicleId) => {
    setBusy(true);
    try {
      await api.post(`/driver/vehicles/${vehicleId}/activate`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const removeVehicle = async (vehicleId) => {
    if (!window.confirm("Remove this vehicle?")) return;
    setBusy(true);
    try {
      await api.delete(`/driver/vehicles/${vehicleId}`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const uploadVehiclePhoto = async (vehicleId, photoType, file) => {
    setBusy(true);
    setError("");
    try {
      const processed = await processVehicleImage(file);
      const [fullPresign, thumbPresign] = await Promise.all([
        api.post(`/driver/vehicles/${vehicleId}/photos/presign`, {
          photo_type: photoType,
          file_name: processed.fileName,
          content_type: processed.contentType,
          variant: "full",
        }),
        api.post(`/driver/vehicles/${vehicleId}/photos/presign`, {
          photo_type: photoType,
          file_name: processed.fileName,
          content_type: processed.contentType,
          variant: "thumbnail",
        }),
      ]);
      const paths = await uploadProcessedImage({
        presign: { full: fullPresign.data, thumb: thumbPresign.data },
        fullBlob: processed.fullBlob,
        thumbBlob: processed.thumbBlob,
        fileName: processed.fileName,
        contentType: processed.contentType,
        bucket: "vehicle-images",
      });
      await api.post(`/driver/vehicles/${vehicleId}/photos/complete`, {
        ...paths,
        photo_type: photoType,
      });
      await load();
    } catch (e) {
      setError(e?.message || "Vehicle photo upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading vehicles…</div>;

  return (
    <div className="space-y-4" data-testid="vehicle-manager">
      {compact && activeVehicle && (
        <div className="card p-4 flex flex-wrap gap-4 items-center">
          {activeVehicle.photos?.[0]?.thumbnail_url || activeVehicle.photos?.[0]?.photo_url ? (
            <img
              src={activeVehicle.photos[0].thumbnail_url || activeVehicle.photos[0].photo_url}
              alt=""
              loading="lazy"
              className="w-24 h-24 rounded-xl object-cover"
            />
          ) : (
            <VehiclePlaceholder vehicleType={activeVehicle.vehicle_type} className="w-24 h-24" />
          )}
          <div className="flex-1 min-w-[180px]">
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Active vehicle</div>
            <div className="font-bold text-lg">
              {[activeVehicle.color, activeVehicle.make, activeVehicle.model].filter(Boolean).join(" ") || activeVehicle.nickname || "Vehicle"}
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {VEHICLE_TYPES.find((t) => t.id === activeVehicle.vehicle_type)?.label}
              {activeVehicle.license_plate ? ` · ${activeVehicle.license_plate}` : ""}
            </div>
          </div>
          {vehicles.length > 1 && (
            <button type="button" className="btn-secondary !py-2 text-sm" disabled={busy} onClick={() => setShowForm("switch")}>
              Switch Active Vehicle
            </button>
          )}
        </div>
      )}

      {!compact && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold">Your vehicles</h3>
            <button type="button" className="btn-secondary !py-2 text-sm inline-flex items-center gap-2" onClick={() => setShowForm(true)}>
              <Plus size={14} /> Add vehicle
            </button>
          </div>

          {vehicles.map((vehicle) => {
            const frontPhoto = vehicle.photos?.find((p) => p.photo_type === "front") || vehicle.photos?.[0];
            return (
              <div key={vehicle.id} className="card p-4 space-y-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      {vehicle.nickname || [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"}
                      {vehicle.is_active && <span className="badge">Active</span>}
                    </div>
                    <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                      {VEHICLE_TYPES.find((t) => t.id === vehicle.vehicle_type)?.label}
                      {vehicle.color ? ` · ${vehicle.color}` : ""}
                      {vehicle.year ? ` · ${vehicle.year}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!vehicle.is_active && (
                      <button type="button" className="btn-primary !py-2 text-sm" disabled={busy} onClick={() => activateVehicle(vehicle.id)}>
                        Set active
                      </button>
                    )}
                    <button type="button" className="btn-ghost !py-2 text-sm text-red-400" disabled={busy} onClick={() => removeVehicle(vehicle.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {frontPhoto?.photo_url ? (
                    <img src={frontPhoto.photo_url} alt="" loading="lazy" className="rounded-xl object-cover w-full h-28" />
                  ) : (
                    <VehiclePlaceholder vehicleType={vehicle.vehicle_type} />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {VEHICLE_PHOTO_TYPES.map((photoType) => {
                    const existing = vehicle.photos?.find((p) => p.photo_type === photoType.id);
                    const refKey = `${vehicle.id}-${photoType.id}`;
                    return (
                      <div key={photoType.id} className="flex items-center justify-between gap-2 p-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
                        <span className="text-sm">{photoType.label}{photoType.required ? " *" : ""}</span>
                        <div className="flex gap-1">
                          {existing && <span className="text-xs text-green-400">Saved</span>}
                          <button type="button" className="btn-ghost !py-1 !px-2 text-xs" disabled={busy} onClick={() => fileInputRefs.current.get(refKey)?.click()}>
                            <Upload size={12} />
                          </button>
                          <button type="button" className="btn-ghost !py-1 !px-2 text-xs" disabled={busy} onClick={() => {
                            const cam = document.createElement("input");
                            cam.type = "file";
                            cam.accept = "image/*";
                            cam.capture = "environment";
                            cam.onchange = (e) => e.target.files?.[0] && uploadVehiclePhoto(vehicle.id, photoType.id, e.target.files[0]);
                            cam.click();
                          }}>
                            <Camera size={12} />
                          </button>
                          <input
                            ref={(el) => {
                              if (el) fileInputRefs.current.set(refKey, el);
                              else fileInputRefs.current.delete(refKey);
                            }}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && uploadVehiclePhoto(vehicle.id, photoType.id, e.target.files[0])}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      {showForm === "switch" && (
        <div className="card p-4 space-y-3">
          <h4 className="font-bold">Switch active vehicle</h4>
          {vehicles.map((vehicle) => (
            <button
              key={vehicle.id}
              type="button"
              className="w-full text-left p-3 rounded-xl border flex items-center justify-between gap-3"
              style={{ borderColor: vehicle.is_active ? "var(--primary)" : "var(--border)" }}
              disabled={busy || vehicle.is_active}
              onClick={() => activateVehicle(vehicle.id)}
            >
              <span>{vehicle.nickname || [vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"}</span>
              {vehicle.is_active && <Star size={14} style={{ color: "var(--primary)" }} />}
            </button>
          ))}
          <button type="button" className="btn-ghost text-sm" onClick={() => setShowForm(false)}>Close</button>
        </div>
      )}

      {showForm === true && (
        <div className="card p-4 space-y-3">
          <h4 className="font-bold">Add vehicle</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="input-field" placeholder="Nickname" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            <select className="input-field" value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
              {VEHICLE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input className="input-field" placeholder="Make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
            <input className="input-field" placeholder="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <input className="input-field" placeholder="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            <input className="input-field" placeholder="Color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            <input className="input-field" placeholder="License plate (optional)" value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} />
            <input className="input-field" placeholder="Fuel type (optional)" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={saveVehicle}>{busy ? "Saving…" : "Save vehicle"}</button>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
