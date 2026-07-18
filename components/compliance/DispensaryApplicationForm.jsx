"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import ElectronicSignature from "@/components/compliance/ElectronicSignature";
import MerchantDocumentUpload from "@/components/compliance/MerchantDocumentUpload";

export default function DispensaryApplicationForm({ onComplete, initial = {} }) {
  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    business_address: "",
    phone: "",
    business_license_number: "",
    state_license_number: "",
    license_expiration_date: "",
    delivery_agreement_accepted: false,
    age_restricted_confirmed: false,
    ...initial,
  });
  const [signature, setSignature] = useState({ typed_name: "", signature_image: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [docsUploaded, setDocsUploaded] = useState({ license_document: false });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (!form.business_name?.trim() || !form.owner_name?.trim()) {
        throw new Error("Business name and owner name are required");
      }
      if (!form.business_license_number?.trim()) {
        throw new Error("Business license number is required");
      }
      if (!form.license_expiration_date) {
        throw new Error("License expiration date is required");
      }
      if (!form.delivery_agreement_accepted || !form.age_restricted_confirmed) {
        throw new Error("You must accept the delivery agreement and age-restricted merchant confirmation");
      }
      if (!docsUploaded.license_document) {
        throw new Error("Please upload your license document");
      }
      const name = signature.typed_name || form.owner_name;
      if (!name?.trim()) throw new Error("Electronic signature required");

      await api.post("/onboarding/restaurant", {
        merchant_category_slug: "licensed_dispensary",
        business_name: form.business_name.trim(),
        owner_name: form.owner_name.trim(),
        business_address: form.business_address,
        phone: form.phone,
        business_license_number: form.business_license_number.trim(),
        state_license_number: form.state_license_number?.trim() || null,
        license_expiration_date: form.license_expiration_date,
        delivery_agreement_accepted: true,
        age_restricted_confirmed: true,
        application_signature: name.trim(),
        signature_image: signature.signature_image || null,
        verification_status: "documents_submitted",
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
    <div className="space-y-4" data-testid="dispensary-application-form">
      <div>
        <h3 className="font-bold text-lg">Licensed dispensary application</h3>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Provide license and business verification. Your application stays pending until an administrator reviews and approves it.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="input-field md:col-span-2" placeholder="Legal business name *" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} data-testid="dispensary-business-name" />
        <input className="input-field" placeholder="Business owner name *" value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
        <input className="input-field" placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        <input className="input-field md:col-span-2" placeholder="Business address" value={form.business_address} onChange={(e) => set("business_address", e.target.value)} />
        <input className="input-field" placeholder="Business license number *" value={form.business_license_number} onChange={(e) => set("business_license_number", e.target.value)} data-testid="dispensary-license-number" />
        <input className="input-field" placeholder="State license number (if applicable)" value={form.state_license_number} onChange={(e) => set("state_license_number", e.target.value)} />
        <label className="text-sm md:col-span-2">
          <span style={{ color: "var(--muted)" }}>License expiration date *</span>
          <input className="input-field mt-1" type="date" value={form.license_expiration_date} onChange={(e) => set("license_expiration_date", e.target.value)} data-testid="dispensary-license-expiration" />
        </label>
      </div>

      <MerchantDocumentUpload
        documentType="dispensary_license"
        label="Upload license documents (PDF or image) *"
        onUploaded={() => setDocsUploaded((d) => ({ ...d, license_document: true }))}
      />

      <div className="space-y-2 p-4 rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.delivery_agreement_accepted} onChange={(e) => set("delivery_agreement_accepted", e.target.checked)} />
          I agree to ZoomEats delivery service terms for licensed, age-restricted merchants, including ID verification at delivery where required.
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.age_restricted_confirmed} onChange={(e) => set("age_restricted_confirmed", e.target.checked)} />
          I confirm this is an age-restricted merchant and I will only sell to eligible customers per applicable law.
        </label>
      </div>

      <ElectronicSignature value={signature} onChange={setSignature} label="Authorized signer certifying information is accurate" />

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" className="btn-primary" disabled={busy} onClick={submit} data-testid="dispensary-application-submit">
        {busy ? "Submitting…" : "Submit for admin review"}
      </button>
    </div>
  );
}
