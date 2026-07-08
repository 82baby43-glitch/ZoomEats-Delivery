"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RESTAURANT_STEPS, stepFieldsForRestaurant } from "@/lib/compliance/onboarding";
import { agreementsForRole } from "@/lib/compliance/agreements";
import StripeConnectSetup from "@/components/compliance/StripeConnectSetup";
import LegalDocumentSigning from "@/components/compliance/LegalDocumentSigning";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function RestaurantOnboardingWizard() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ hours: {} });
  const [busy, setBusy] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState({});
  const [signedAgreements, setSignedAgreements] = useState({});
  const [signingBusy, setSigningBusy] = useState(null);

  const agreements = agreementsForRole("vendor");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [onboardingRes, progressRes, agreementsRes] = await Promise.all([
        api.get("/onboarding/restaurant"),
        api.get("/onboarding/progress", { params: { type: "restaurant" } }),
        api.get("/agreements/me"),
      ]);
      const d = onboardingRes?.data || {};
      const progress = progressRes?.data || {};
      if (progress.current_step) setStep(progress.current_step);
      else if (d.current_step) setStep(d.current_step);
      setForm((f) => ({
        ...f,
        ...d,
        email: d.email || user.email,
        hours: d.hours || f.hours || {},
      }));
      const signed = {};
      (agreementsRes?.data || []).forEach((a) => {
        if (a.accepted) signed[a.type] = true;
      });
      setSignedAgreements(signed);
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const urlStep = Number(searchParams.get("step"));
    if (urlStep >= 1 && urlStep <= 4) setStep(urlStep);
    if (searchParams.get("stripe") === "return") load();
  }, [searchParams, load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const setHours = (day, field, value) => {
    setForm((f) => ({
      ...f,
      hours: { ...f.hours, [day]: { ...f.hours?.[day], [field]: value } },
    }));
  };

  const saveStep = async (nextStep) => {
    setBusy(true);
    try {
      const payload = { step: nextStep };
      const fields = stepFieldsForRestaurant(step);
      for (const k of fields) {
        if (form[k] !== undefined) payload[k] = form[k];
      }
      if (step === 1) payload.hours = form.hours;
      await api.post("/onboarding/restaurant", payload);
      await api.post("/onboarding/progress", {
        onboarding_type: "restaurant",
        completed_steps: Array.from({ length: step }, (_, i) => RESTAURANT_STEPS[i].key),
        current_step: nextStep,
      });
      setStep(nextStep);
      if (nextStep > 4) router.push("/pending-approval");
    } catch (e) {
      alert(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadDoc = async (documentType, file) => {
    if (!file) return;
    setBusy(true);
    try {
      const presign = await api.post("/uploads/presign", {
        document_type: documentType,
        file_name: file.name,
        content_type: file.type,
        entity_type: "restaurant",
      });
      const { upload_url, document_id, token } = presign?.data || {};
      if (!upload_url) throw new Error("Upload URL unavailable");
      await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type, "x-upsert": "true", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: file,
      });
      await api.post("/uploads/complete", { document_id, entity_type: "restaurant" });
      setUploadedDocs((d) => ({ ...d, [documentType]: true }));
    } catch (e) {
      alert(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const signAgreement = async (signData) => {
    setSigningBusy(signData.agreement_type);
    try {
      await api.post("/agreements/sign-document", signData);
      setSignedAgreements((s) => ({ ...s, [signData.agreement_type]: true }));
    } catch (e) {
      alert(e?.message || "Signing failed");
    } finally {
      setSigningBusy(null);
    }
  };

  const finishOnboarding = async () => {
    setBusy(true);
    try {
      await api.post("/onboarding/progress", {
        onboarding_type: "restaurant",
        completed_steps: RESTAURANT_STEPS.map((s) => s.key),
        current_step: 4,
        approval_status: "pending_review",
      });
      await api.post("/onboarding/restaurant", { step: 4, status: "pending_review" });
      router.push("/pending-approval");
    } catch (e) {
      alert(e?.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  const current = RESTAURANT_STEPS.find((s) => s.id === step) || RESTAURANT_STEPS[0];
  const allAgreementsSigned = agreements.every((a) => signedAgreements[a.type]);

  return (
    <div>
      <Header />
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="label-eyebrow">Restaurant Merchant Application · Step {step} of {RESTAURANT_STEPS.length}</div>
        <h1 className="font-display text-3xl font-bold mt-2">{current.title}</h1>

        <div className="flex gap-2 mt-6">
          {RESTAURANT_STEPS.map((s) => (
            <div
              key={s.id}
              className="h-1 flex-1 rounded-full"
              style={{ background: s.id <= step ? "var(--primary)" : "var(--surface-2)" }}
            />
          ))}
        </div>

        <div className="mt-8 space-y-6">
          {step === 1 && (
            <div className="card p-6 space-y-4">
              <Field label="Restaurant name" value={form.business_name} onChange={(v) => set("business_name", v)} />
              <Field label="Owner / legal representative" value={form.owner_name} onChange={(v) => set("owner_name", v)} />
              <Field label="Business address" value={form.business_address} onChange={(v) => set("business_address", v)} />
              <Field label="Phone" type="tel" value={form.phone} onChange={(v) => set("phone", v)} />
              <Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />
              <Field label="Cuisine type" value={form.cuisine} onChange={(v) => set("cuisine", v)} placeholder="e.g. Italian, Mexican, American" />
              <hr style={{ borderColor: "var(--border)" }} />
              <p className="label-eyebrow">Operating hours</p>
              {DAYS.map((day) => (
                <div key={day} className="grid grid-cols-3 gap-2 items-center text-sm">
                  <span className="capitalize">{day}</span>
                  <input className="input-field" type="time" value={form.hours?.[day]?.open || ""} onChange={(e) => setHours(day, "open", e.target.value)} />
                  <input className="input-field" type="time" value={form.hours?.[day]?.close || ""} onChange={(e) => setHours(day, "close", e.target.value)} />
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="card p-6 space-y-4">
              <Field label="EIN (Employer Identification Number)" value={form.ein} onChange={(v) => set("ein", v)} />
              <Field label="Business tax ID / sales tax ID" value={form.sales_tax_id} onChange={(v) => set("sales_tax_id", v)} />
              <DocUpload label="Business license" docType="business_license" uploaded={uploadedDocs.business_license} onUpload={uploadDoc} required />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(form.food_permit_required)} onChange={(e) => set("food_permit_required", e.target.checked)} />
                Food permit required for my location
              </label>
              {form.food_permit_required && (
                <DocUpload label="Food permit" docType="food_permit" uploaded={uploadedDocs.food_permit} onUpload={uploadDoc} />
              )}
              <hr style={{ borderColor: "var(--border)" }} />
              <p className="label-eyebrow">Owner verification</p>
              <DocUpload label="Owner ID verification" docType="owner_id" uploaded={uploadedDocs.owner_id} onUpload={uploadDoc} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(form.owner_verified)} onChange={(e) => set("owner_verified", e.target.checked)} />
                I confirm I am the authorized owner or legal representative
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="card p-6">
              <StripeConnectSetup entityType="restaurant" onComplete={() => load()} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              {agreements.map((a) => (
                signedAgreements[a.type] ? (
                  <div key={a.type} className="card p-4 flex items-center gap-2 text-green-400 text-sm">
                    ✓ {a.title} — Signed
                  </div>
                ) : (
                  <LegalDocumentSigning
                    key={a.type}
                    agreement={a}
                    defaultName={form.owner_name || user.name || ""}
                    busy={signingBusy === a.type}
                    onSigned={signAgreement}
                  />
                )
              ))}
            </div>
          )}

          <div className="flex gap-3">
            {step > 1 && (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>
            )}
            {step < 4 && (
              <button type="button" className="btn-primary flex-1" disabled={busy} onClick={() => saveStep(step + 1)}>
                {busy ? "Saving…" : "Continue"}
              </button>
            )}
            {step === 4 && allAgreementsSigned && (
              <button type="button" className="btn-primary flex-1" disabled={busy} onClick={finishOnboarding}>
                {busy ? "Submitting…" : "Submit application for review"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input-field w-full"
        type={type}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function DocUpload({ label, docType, uploaded, onUpload, required }) {
  return (
    <div>
      <label className="label">{label}{required ? " *" : ""}</label>
      <input type="file" accept="image/*,application/pdf" className="input-field w-full" onChange={(e) => onUpload(docType, e.target.files?.[0])} />
      {uploaded && <p className="text-xs text-green-400 mt-1">Uploaded ✓</p>}
    </div>
  );
}
