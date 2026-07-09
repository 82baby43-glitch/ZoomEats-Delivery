"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DRIVER_STEPS, stepFieldsForDriver } from "@/lib/compliance/onboarding";
import { agreementsForRole } from "@/lib/compliance/agreements";
import StripeConnectSetup from "@/components/compliance/StripeConnectSetup";
import LegalDocumentSigning from "@/components/compliance/LegalDocumentSigning";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

export default function DriverOnboardingWizard() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState({});
  const [signedAgreements, setSignedAgreements] = useState({});
  const [signingBusy, setSigningBusy] = useState(null);

  const agreements = agreementsForRole("delivery");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [onboardingRes, progressRes, agreementsRes] = await Promise.all([
        api.get("/onboarding/driver"),
        api.get("/onboarding/progress", { params: { type: "driver" } }),
        api.get("/agreements/me"),
      ]);
      const d = onboardingRes?.data || {};
      const progress = progressRes?.data || {};
      if (progress.current_step) setStep(progress.current_step);
      else if (d.current_step) setStep(d.current_step);
      setForm((f) => ({ ...f, ...d, email: d.email || user.email }));
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

  const saveStep = async (nextStep) => {
    setBusy(true);
    try {
      const payload = { step: nextStep };
      const fields = stepFieldsForDriver(step);
      for (const k of fields) {
        if (form[k] !== undefined) payload[k] = form[k];
      }
      if (step === 1) payload.status = "incomplete";
      await api.post("/onboarding/driver", payload);
      await api.post("/onboarding/progress", {
        onboarding_type: "driver",
        completed_steps: Array.from({ length: step }, (_, i) => DRIVER_STEPS[i].key),
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
        entity_type: "driver",
      });
      const { upload_url, document_id, token } = presign?.data || {};
      if (!upload_url) throw new Error("Upload URL unavailable");
      await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type, "x-upsert": "true", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: file,
      });
      await api.post("/uploads/complete", {
        document_id,
        entity_type: "driver",
        expires_at: form[`${documentType}_expires`] || null,
      });
      setUploadedDocs((d) => ({ ...d, [documentType]: true }));
    } catch (e) {
      alert(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const submitTax = async () => {
    setBusy(true);
    try {
      await api.post("/onboarding/driver/tax", {
        legal_name: form.legal_name,
        business_name: form.business_name,
        tax_classification: form.tax_classification || "individual",
        tax_id: form.tax_id,
        address_line1: form.address_line1,
        city: form.city,
        state: form.state,
        zip: form.zip,
        signature: form.tax_signature,
      });
      await saveStep(4);
    } catch (e) {
      alert(e?.message || "Tax save failed");
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
        onboarding_type: "driver",
        completed_steps: DRIVER_STEPS.map((s) => s.key),
        current_step: 4,
        approval_status: "pending_review",
      });
      await api.post("/onboarding/driver", { step: 4, status: "pending_review" });
      router.push("/pending-approval");
    } catch (e) {
      alert(e?.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  const current = DRIVER_STEPS.find((s) => s.id === step) || DRIVER_STEPS[0];
  const allAgreementsSigned = agreements.every((a) => signedAgreements[a.type]);
  const step3Ready = form.tax_id && form.tax_signature && form.tax_classification;

  return (
    <div>
      <Header />
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="label-eyebrow">Driver Application · Step {step} of {DRIVER_STEPS.length}</div>
        <h1 className="font-display text-3xl font-bold mt-2">{current.title}</h1>

        <div className="flex gap-2 mt-6">
          {DRIVER_STEPS.map((s) => (
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
              <Field label="Full legal name" value={form.legal_name} onChange={(v) => set("legal_name", v)} />
              <Field label="Date of birth" type="date" value={form.date_of_birth} onChange={(v) => set("date_of_birth", v)} />
              <Field label="Phone number" type="tel" value={form.phone} onChange={(v) => set("phone", v)} />
              <Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />
              <Field label="Address" value={form.address_line1} onChange={(v) => set("address_line1", v)} />
              <div className="grid grid-cols-3 gap-3">
                <Field label="City" value={form.city} onChange={(v) => set("city", v)} />
                <Field label="State" value={form.state} onChange={(v) => set("state", v)} />
                <Field label="ZIP" value={form.zip} onChange={(v) => set("zip", v)} />
              </div>
              <hr style={{ borderColor: "var(--border)" }} />
              <p className="label-eyebrow">Emergency contact</p>
              <Field label="Contact name" value={form.emergency_contact_name} onChange={(v) => set("emergency_contact_name", v)} />
              <Field label="Contact phone" type="tel" value={form.emergency_contact_phone} onChange={(v) => set("emergency_contact_phone", v)} />
              <Field label="Relationship" value={form.emergency_contact_relationship} onChange={(v) => set("emergency_contact_relationship", v)} placeholder="e.g. Spouse, Parent" />
            </div>
          )}

          {step === 2 && (
            <div className="card p-6 space-y-4">
              <Field label="Driver license number" value={form.license_number} onChange={(v) => set("license_number", v)} />
              <div>
                <label className="label">License state</label>
                <select className="input-field w-full" value={form.license_state || ""} onChange={(e) => set("license_state", e.target.value)}>
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Field label="License expiration" type="date" value={form.license_expiration} onChange={(v) => set("license_expiration", v)} />
              <hr style={{ borderColor: "var(--border)" }} />
              <p className="label-eyebrow">Vehicle information</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Make" value={form.vehicle_make} onChange={(v) => set("vehicle_make", v)} />
                <Field label="Model" value={form.vehicle_model} onChange={(v) => set("vehicle_model", v)} />
                <Field label="Year" type="number" value={form.vehicle_year} onChange={(v) => set("vehicle_year", v)} />
                <Field label="Color" value={form.vehicle_color} onChange={(v) => set("vehicle_color", v)} />
              </div>
              <Field label="License plate" value={form.vehicle_plate} onChange={(v) => set("vehicle_plate", v)} />
              <hr style={{ borderColor: "var(--border)" }} />
              <p className="label-eyebrow">Insurance information</p>
              <Field label="Insurance provider" value={form.insurance_provider} onChange={(v) => set("insurance_provider", v)} />
              <Field label="Policy number" value={form.insurance_policy_number} onChange={(v) => set("insurance_policy_number", v)} />
              <Field label="Insurance expiration" type="date" value={form.insurance_expiration} onChange={(v) => set("insurance_expiration", v)} />
              <hr style={{ borderColor: "var(--border)" }} />
              <DocUpload label="Driver's license image" docType="drivers_license" uploaded={uploadedDocs.drivers_license} onUpload={uploadDoc} />
              <DocUpload label="Insurance document" docType="insurance" uploaded={uploadedDocs.insurance} onUpload={uploadDoc} />
            </div>
          )}

          {step === 3 && (
            <div className="card p-6 space-y-4">
              <p className="label-eyebrow">W-9 Tax Information</p>
              <div>
                <label className="label">Tax classification</label>
                <select className="input-field w-full" value={form.tax_classification || "individual"} onChange={(e) => set("tax_classification", e.target.value)}>
                  <option value="individual">Individual / Sole proprietor</option>
                  <option value="llc">LLC</option>
                  <option value="corporation">Corporation</option>
                  <option value="partnership">Partnership</option>
                </select>
              </div>
              <Field label="SSN or EIN" value={form.tax_id} onChange={(v) => set("tax_id", v)} />
              <Field label="W-9 signature (typed legal name)" value={form.tax_signature} onChange={(v) => set("tax_signature", v)} />
              <hr style={{ borderColor: "var(--border)" }} />
              <StripeConnectSetup entityType="driver" onComplete={() => load()} />
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
                    defaultName={form.legal_name || user.name || ""}
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
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={busy}
                onClick={() => (step === 3 ? submitTax() : saveStep(step + 1))}
              >
                {busy ? "Saving…" : "Continue"}
              </button>
            )}
            {step === 3 && !step3Ready && (
              <p className="text-xs text-amber-400 self-center">Complete W-9 fields to continue</p>
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

function DocUpload({ label, docType, uploaded, onUpload }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="file" accept="image/*,application/pdf" className="input-field w-full" onChange={(e) => onUpload(docType, e.target.files?.[0])} />
      {uploaded && <p className="text-xs text-green-400 mt-1">Uploaded ✓</p>}
    </div>
  );
}
