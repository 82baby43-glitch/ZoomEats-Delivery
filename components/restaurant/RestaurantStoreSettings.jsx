"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { FULFILLMENT_OPTIONS } from "@/lib/merchant/dispensaryPositioning";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function defaultHours() {
  return Object.fromEntries(DAY_KEYS.map((d) => [d, { open: "09:00", close: "22:00", closed: false }]));
}

export default function RestaurantStoreSettings({
  restaurant,
  onSave,
  isDispensary = false,
  fulfillmentType = "",
  onSaveFulfillment,
}) {
  const [form, setForm] = useState({
    address: restaurant?.address || "",
    phone: restaurant?.phone || "",
    delivery_time_min: restaurant?.delivery_time_min ?? 30,
    delivery_radius_km: restaurant?.delivery_radius_km ?? "",
    minimum_order: restaurant?.minimum_order ?? "",
    busy_mode: restaurant?.busy_mode ?? false,
    business_hours: restaurant?.business_hours && Object.keys(restaurant.business_hours).length
      ? restaurant.business_hours
      : defaultHours(),
    temporary_closure: restaurant?.temporary_closure?.reason || "",
  });
  const [selectedFulfillment, setSelectedFulfillment] = useState(fulfillmentType || "");
  const [saving, setSaving] = useState(false);
  const [savingFulfillment, setSavingFulfillment] = useState(false);

  const setHour = (day, field, value) => {
    setForm((f) => ({
      ...f,
      business_hours: {
        ...f.business_hours,
        [day]: { ...f.business_hours[day], [field]: value },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        address: form.address,
        phone: form.phone,
        delivery_time_min: Number(form.delivery_time_min),
        delivery_radius_km: form.delivery_radius_km ? Number(form.delivery_radius_km) : null,
        minimum_order: form.minimum_order ? Number(form.minimum_order) : null,
        busy_mode: form.busy_mode,
        business_hours: form.business_hours,
        temporary_closure: form.temporary_closure
          ? { reason: form.temporary_closure, until: null }
          : null,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFulfillment = async () => {
    if (!onSaveFulfillment || !selectedFulfillment) return;
    setSavingFulfillment(true);
    try {
      await onSaveFulfillment(selectedFulfillment);
    } finally {
      setSavingFulfillment(false);
    }
  };

  return (
    <div className="card p-6 max-w-2xl space-y-5">
      <h3 className="font-display text-xl font-bold">Store management</h3>

      <input className="input-field" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <input className="input-field" placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

      <div>
        <h4 className="font-bold mb-3">Fulfillment &amp; Logistics Settings</h4>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          Configure prep times and service area. ZoomEats provides logistics coordination technology — merchants and approved partners remain responsible for regulated fulfillment.
        </p>

        {isDispensary && (
          <div className="space-y-2 mb-5">
            {FULFILLMENT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-2 p-3 rounded-lg border cursor-pointer"
                style={{ borderColor: selectedFulfillment === opt.value ? "var(--primary)" : "var(--border)" }}
              >
                <input
                  type="radio"
                  name="store_fulfillment_type"
                  value={opt.value}
                  checked={selectedFulfillment === opt.value}
                  onChange={() => setSelectedFulfillment(opt.value)}
                />
                <span>
                  <span className="font-medium block">{opt.label}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{opt.description}</span>
                </span>
              </label>
            ))}
            {onSaveFulfillment && (
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={savingFulfillment || !selectedFulfillment}
                onClick={handleSaveFulfillment}
              >
                {savingFulfillment ? "Saving…" : "Save fulfillment method"}
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-eyebrow">Prep time (min)</label>
            <input className="input-field" type="number" value={form.delivery_time_min} onChange={(e) => setForm({ ...form, delivery_time_min: e.target.value })} />
          </div>
          <div>
            <label className="label-eyebrow">Service radius (km)</label>
            <input className="input-field" type="number" step="0.1" value={form.delivery_radius_km} onChange={(e) => setForm({ ...form, delivery_radius_km: e.target.value })} />
          </div>
          <div>
            <label className="label-eyebrow">Minimum order ($)</label>
            <input className="input-field" type="number" step="0.01" value={form.minimum_order} onChange={(e) => setForm({ ...form, minimum_order: e.target.value })} />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={form.busy_mode} onChange={(e) => setForm({ ...form, busy_mode: e.target.checked })} />
        Busy mode (extended prep times)
      </label>

      <div>
        <label className="label-eyebrow">Temporary closure reason</label>
        <input className="input-field" placeholder="Leave blank if open" value={form.temporary_closure} onChange={(e) => setForm({ ...form, temporary_closure: e.target.value })} />
      </div>

      <div>
        <h4 className="font-bold mb-3">Business hours</h4>
        <div className="space-y-2">
          {DAY_KEYS.map((day) => (
            <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-10 font-medium">{DAY_LABELS[day]}</span>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!form.business_hours[day]?.closed} onChange={(e) => setHour(day, "closed", !e.target.checked)} />
                Open
              </label>
              <input className="input-field !py-1 !px-2 w-24" type="time" value={form.business_hours[day]?.open || "09:00"} onChange={(e) => setHour(day, "open", e.target.value)} />
              <span>–</span>
              <input className="input-field !py-1 !px-2 w-24" type="time" value={form.business_hours[day]?.close || "22:00"} onChange={(e) => setHour(day, "close", e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={saving} onClick={handleSave}>
        <Save size={16} /> Save store settings
      </button>
    </div>
  );
}
