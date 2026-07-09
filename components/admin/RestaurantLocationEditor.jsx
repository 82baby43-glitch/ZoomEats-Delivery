"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MapPin, X } from "lucide-react";

export default function RestaurantLocationEditor({ restaurantId, onClose, onSaved }) {
  const [form, setForm] = useState({ address: "", city: "", state: "", zip_code: "", latitude: "", longitude: "" });
  const [readiness, setReadiness] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    Promise.all([
      api.get(`/admin/restaurants/${restaurantId}/readiness`),
      api.get("/admin/restaurants").then((r) => {
        const list = r?.data || r || [];
        return Array.isArray(list) ? list.find((x) => x.restaurant_id === restaurantId) : null;
      }),
    ]).then(([ready, rest]) => {
      setReadiness(ready?.data || ready);
      if (rest) {
        setForm({
          address: rest.address || "",
          city: rest.city || "",
          state: rest.state || "",
          zip_code: rest.zip_code || "",
          latitude: rest.latitude != null ? String(rest.latitude) : "",
          longitude: rest.longitude != null ? String(rest.longitude) : "",
        });
      }
    }).catch(console.warn);
  }, [restaurantId]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/admin/restaurants/${restaurantId}/location`, {
        address: form.address,
        city: form.city,
        state: form.state,
        zip_code: form.zip_code,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      });
      onSaved?.(r?.data || r);
      onClose?.();
    } catch (e) {
      alert(e?.message || "Could not save location");
    } finally {
      setBusy(false);
    }
  };

  if (!restaurantId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="card max-w-lg w-full p-6 relative">
        <button type="button" className="absolute top-4 right-4 btn-ghost !p-2" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <MapPin size={18} /> Restaurant Location
        </h2>
        {readiness && (
          <div className="mt-3 p-3 rounded-lg text-sm space-y-1" style={{ background: "var(--surface-2)" }}>
            {(readiness.checks || []).map((c) => (
              <div key={c.label}>{c.ok ? "✅" : "❌"} {c.label}: {c.detail}</div>
            ))}
          </div>
        )}
        <div className="mt-4 space-y-3">
          <input className="input-field w-full" placeholder="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          <div className="grid grid-cols-3 gap-2">
            <input className="input-field" placeholder="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            <input className="input-field" placeholder="State" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            <input className="input-field" placeholder="ZIP" value={form.zip_code} onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="Latitude" type="number" step="any" value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} />
            <input className="input-field" placeholder="Longitude" type="number" step="any" value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary flex-1" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save location"}
          </button>
        </div>
      </div>
    </div>
  );
}
