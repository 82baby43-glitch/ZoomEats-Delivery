"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import ElectronicSignature from "@/components/compliance/ElectronicSignature";
import MerchantDocumentUpload from "@/components/compliance/MerchantDocumentUpload";
import { categoryApplicationConfig } from "@/lib/merchant/categoryConfig";

export default function RestaurantApplicationForm({ onComplete, initial = {}, merchantCategorySlug = "restaurants" }) {
  const config = categoryApplicationConfig(merchantCategorySlug);
  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    business_address: "",
    phone: "",
    cuisine: "",
    ein: "",
    sales_tax_id: "",
    food_permit_number: "",
    business_license_number: "",
    state_license_number: "",
    license_expiration_date: "",
    delivery_agreement_accepted: false,
    age_restricted_confirmed: false,
    hours: "",
    ...initial,
  });
  const [signature, setSignature] = useState({ typed_name: "", signature_image: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [docsUploaded, setDocsUploaded] = useState({ liquor_license: false });

  useEffect(() => {
    api.get("/onboarding/restaurant").then((r) => {
      const d = r?.data ?? r;
      if (d?.business_name) {
        setForm((f) => ({
          ...f,
          ...d,
          hours: d.hours ? JSON.stringify(d.hours) : "",
          delivery_agreement_accepted: Boolean(d.delivery_agreement_accepted),
          age_restricted_confirmed: Boolean(d.age_restricted_confirmed),
        }));
      }
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
      if (config.requireBusinessLicense && !form.business_license_number?.trim()) {
        throw new Error("Business license number is required");
      }
      if (config.requireLiquorLicense) {
        if (!form.license_expiration_date) throw new Error("Liquor license expiration date is required");
        if (!form.delivery_agreement_accepted || !form.age_restricted_confirmed) {
          throw new Error("You must accept the delivery agreement and age-restricted merchant confirmation");
        }
        if (!docsUploaded.liquor_license) throw new Error("Please upload your liquor license document");
      }
      const name = signature.typed_name || form.owner_name;
      if (!name?.trim()) throw new Error("Electronic signature required");

      await api.post("/onboarding/restaurant", {
        merchant_category_slug: merchantCategorySlug,
        business_name: form.business_name.trim(),
        owner_name: form.owner_name.trim(),
        business_address: form.business_address,
        phone: form.phone,
        cuisine: config.showCuisine ? form.cuisine : null,
        ein: form.ein,
        sales_tax_id: form.sales_tax_id,
        food_permit_number: config.showFoodPermit ? form.food_permit_number : null,
        business_license_number: config.showBusinessLicense ? form.business_license_number?.trim() || null : null,
        state_license_number: config.requireLiquorLicense ? form.state_license_number?.trim() || null : null,
        license_expiration_date: config.requireLiquorLicense ? form.license_expiration_date : null,
        delivery_agreement_accepted: config.requireAgeConfirmation ? form.delivery_agreement_accepted : null,
        age_restricted_confirmed: config.requireAgeConfirmation ? form.age_restricted_confirmed : null,
        hours: form.hours,
        application_signature: name.trim(),
        signature_image: signature.signature_image || null,
        verification_status: config.requireLiquorLicense ? "documents_submitted" : undefined,
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
        <h3 className="font-bold text-lg">{config.title}</h3>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{config.subtitle}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="input-field" placeholder="Legal business name *" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} data-testid="restaurant-business-name" />
        <input className="input-field" placeholder="Owner / authorized signer *" value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
        <input className="input-field md:col-span-2" placeholder="Business address" value={form.business_address} onChange={(e) => set("business_address", e.target.value)} />
        <input className="input-field" placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        {config.showCuisine && (
          <input className="input-field" placeholder="Cuisine type" value={form.cuisine} onChange={(e) => set("cuisine", e.target.value)} />
        )}
        <input className="input-field" placeholder="EIN" value={form.ein} onChange={(e) => set("ein", e.target.value)} />
        <input className="input-field" placeholder="Sales tax ID" value={form.sales_tax_id} onChange={(e) => set("sales_tax_id", e.target.value)} />
        {config.showFoodPermit && (
          <input className="input-field md:col-span-2" placeholder="Food permit / health permit #" value={form.food_permit_number} onChange={(e) => set("food_permit_number", e.target.value)} />
        )}
        {config.showBusinessLicense && (
          <input className="input-field" placeholder="Business license number *" value={form.business_license_number} onChange={(e) => set("business_license_number", e.target.value)} data-testid="merchant-business-license" />
        )}
        {config.requireLiquorLicense && (
          <>
            <input className="input-field" placeholder="State liquor license number" value={form.state_license_number} onChange={(e) => set("state_license_number", e.target.value)} />
            <label className="text-sm md:col-span-2">
              <span style={{ color: "var(--muted)" }}>Liquor license expiration date *</span>
              <input className="input-field mt-1" type="date" value={form.license_expiration_date} onChange={(e) => set("license_expiration_date", e.target.value)} data-testid="liquor-license-expiration" />
            </label>
          </>
        )}
        <textarea className="input-field md:col-span-2" rows={2} placeholder="Operating hours (e.g. Mon-Fri 11am-9pm)" value={form.hours} onChange={(e) => set("hours", e.target.value)} />
      </div>

      {config.requireLiquorLicense && (
        <>
          <MerchantDocumentUpload
            documentType="liquor_license"
            label="Upload liquor license documents (PDF or image) *"
            onUploaded={() => setDocsUploaded((d) => ({ ...d, liquor_license: true }))}
          />
          <div className="space-y-2 p-4 rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.delivery_agreement_accepted} onChange={(e) => set("delivery_agreement_accepted", e.target.checked)} />
              I agree to ZoomEats delivery terms for licensed liquor retailers, including ID verification at delivery where required.
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.age_restricted_confirmed} onChange={(e) => set("age_restricted_confirmed", e.target.checked)} />
              I confirm this is an age-restricted merchant and I will only sell alcohol to eligible customers per applicable law.
            </label>
          </div>
        </>
      )}

      <ElectronicSignature value={signature} onChange={setSignature} label="Owner signature certifying information is accurate" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" className="btn-primary" disabled={busy} onClick={submit} data-testid="restaurant-application-submit">
        {busy ? "Saving…" : config.requireLiquorLicense ? "Submit for admin review" : "Save application"}
      </button>
    </div>
  );
}
