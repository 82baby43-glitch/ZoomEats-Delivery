"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import ElectronicSignature from "@/components/compliance/ElectronicSignature";

export default function DriverApplicationForm({ onComplete, initial = {} }) {
  const [form, setForm] = useState({
    legal_name: "",
    date_of_birth: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zip: "",
    license_number: "",
    license_expiration: "",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_year: "",
    vehicle_color: "",
    vehicle_plate: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    ...initial,
  });
  const [signature, setSignature] = useState({ typed_name: "", signature_image: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/onboarding/driver").then((r) => {
      const d = r?.data ?? r;
      if (d) setForm((f) => ({ ...f, ...d }));
    }).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (!form.legal_name?.trim() || !form.license_number?.trim()) {
        throw new Error("Legal name and driver license number are required");
      }
      const name = signature.typed_name || form.legal_name;
      if (!name?.trim()) throw new Error("Electronic signature required");
      await api.post("/onboarding/driver", {
        step: 1,
        ...form,
        application_signature: name.trim(),
        signature_image: signature.signature_image || null,
        status: "incomplete",
      });
      onComplete?.();
    } catch (e) {
      setError(e?.message || "Application save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="driver-application-form">
      <div>
        <h3 className="font-bold text-lg">Driver application</h3>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Complete your profile before signing platform agreements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="input-field" placeholder="Legal full name" value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} data-testid="driver-legal-name" />
        <input className="input-field" type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
        <input className="input-field" placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        <input className="input-field md:col-span-2" placeholder="Street address" value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} />
        <input className="input-field" placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
        <input className="input-field" placeholder="State" value={form.state} onChange={(e) => set("state", e.target.value)} />
        <input className="input-field" placeholder="ZIP" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
        <input className="input-field" placeholder="Driver license #" value={form.license_number} onChange={(e) => set("license_number", e.target.value)} />
        <input className="input-field" type="date" placeholder="License expiration" value={form.license_expiration} onChange={(e) => set("license_expiration", e.target.value)} />
        <input className="input-field" placeholder="Vehicle make" value={form.vehicle_make} onChange={(e) => set("vehicle_make", e.target.value)} />
        <input className="input-field" placeholder="Vehicle model" value={form.vehicle_model} onChange={(e) => set("vehicle_model", e.target.value)} />
        <input className="input-field" placeholder="Year" value={form.vehicle_year} onChange={(e) => set("vehicle_year", e.target.value)} />
        <input className="input-field" placeholder="Color" value={form.vehicle_color} onChange={(e) => set("vehicle_color", e.target.value)} />
        <input className="input-field" placeholder="License plate" value={form.vehicle_plate} onChange={(e) => set("vehicle_plate", e.target.value)} />
        <input className="input-field" placeholder="Emergency contact name" value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} />
        <input className="input-field" placeholder="Emergency contact phone" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
      </div>

      <ElectronicSignature value={signature} onChange={setSignature} label="Sign certifying application information is accurate" />

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" className="btn-primary" disabled={busy} onClick={submit} data-testid="driver-application-submit">
        {busy ? "Saving…" : "Save application & continue"}
      </button>
    </div>
  );
}
