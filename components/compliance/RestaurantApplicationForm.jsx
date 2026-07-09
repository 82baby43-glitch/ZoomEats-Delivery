"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import ElectronicSignature from "@/components/compliance/ElectronicSignature";

export default function RestaurantApplicationForm({ onComplete, initial = {} }) {
  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    business_address: "",
    phone: "",
    cuisine: "",
    ein: "",
    sales_tax_id: "",
    food_permit_number: "",
    hours: "",
    ...initial,
  });
  const [signature, setSignature] = useState({ typed_name: "", signature_image: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/onboarding/restaurant").then((r) => {
      const d = r?.data ?? r;
      if (d?.business_name) setForm((f) => ({ ...f, ...d, hours: d.hours ? JSON.stringify(d.hours) : "" }));
    }).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (!form.business_name?.trim() || !form.owner_name?.trim()) {
        throw new Error("Business name and owner name are required");
      }
      const name = signature.typed_name || form.owner_name;
      if (!name?.trim()) throw new Error("Electronic signature required");
      await api.post("/onboarding/restaurant", {
        ...form,
        application_signature: name.trim(),
        signature_image: signature.signature_image || null,
        status: "submitted",
      });
      onComplete?.();
    } catch (e) {
      setError(e?.message || "Application save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="restaurant-application-form">
      <div>
        <h3 className="font-bold text-lg">Restaurant application</h3>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Provide your business details for merchant verification and food safety compliance.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="input-field" placeholder="Legal business name" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} data-testid="restaurant-business-name" />
        <input className="input-field" placeholder="Owner / authorized signer" value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
        <input className="input-field md:col-span-2" placeholder="Business address" value={form.business_address} onChange={(e) => set("business_address", e.target.value)} />
        <input className="input-field" placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        <input className="input-field" placeholder="Cuisine type" value={form.cuisine} onChange={(e) => set("cuisine", e.target.value)} />
        <input className="input-field" placeholder="EIN" value={form.ein} onChange={(e) => set("ein", e.target.value)} />
        <input className="input-field" placeholder="Sales tax ID" value={form.sales_tax_id} onChange={(e) => set("sales_tax_id", e.target.value)} />
        <input className="input-field" placeholder="Food permit / health permit #" value={form.food_permit_number} onChange={(e) => set("food_permit_number", e.target.value)} />
        <textarea className="input-field md:col-span-2" rows={2} placeholder="Operating hours (e.g. Mon-Fri 11am-9pm)" value={form.hours} onChange={(e) => set("hours", e.target.value)} />
      </div>
      <ElectronicSignature value={signature} onChange={setSignature} label="Owner signature certifying information is accurate" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" className="btn-primary" disabled={busy} onClick={submit} data-testid="restaurant-application-submit">
        {busy ? "Saving…" : "Save application"}
      </button>
    </div>
  );
}
