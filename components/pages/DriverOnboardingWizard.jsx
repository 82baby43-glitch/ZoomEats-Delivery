"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ComplianceAgreementWizard from "@/components/compliance/ComplianceAgreementWizard";
import DeliveryModeStep from "@/components/driver/DeliveryModeStep";
import { VEHICLE_MODES } from "@/lib/deliveryModes/constants";

const STEPS = [
  { id: 1, title: "Identity", fields: ["legal_name", "date_of_birth", "phone", "address_line1", "city", "state", "zip"] },
  { id: 2, title: "Delivery Method", deliveryMode: true },
  { id: 3, title: "Government ID", docTypes: ["drivers_license", "selfie"] },
  { id: 4, title: "Vehicle", fields: ["vehicle_make", "vehicle_model", "vehicle_year", "vehicle_color", "vehicle_plate", "license_expiration"], docTypes: ["vehicle_registration", "insurance"], vehicleOnly: true },
  { id: 5, title: "Tax (W-9)", tax: true },
  { id: 6, title: "Agreements", agreements: true },
];

export default function DriverOnboardingWizard() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({});
  const [selectedModes, setSelectedModes] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get("/onboarding/driver").then((r) => {
      const d = r?.data;
      if (d?.current_step) setStep(d.current_step);
      setForm((f) => ({ ...f, ...d }));
      if (Array.isArray(d?.selected_delivery_modes)) setSelectedModes(d.selected_delivery_modes);
    }).catch(() => {});
  }, [user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const needsVehicleStep = selectedModes.some((m) => VEHICLE_MODES.includes(m));

  const saveStep = async (nextStep) => {
    setBusy(true);
    try {
      await api.post("/onboarding/driver", { step: nextStep, ...form, status: nextStep >= STEPS.length ? "pending_review" : "incomplete" });
      setStep(nextStep);
      if (nextStep > STEPS.length) router.push("/pending-approval");
    } catch (e) {
      alert(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const advanceFromStep = (fromStep) => {
    let next = fromStep + 1;
    // Skip vehicle step if no vehicle modes selected
    if (next === 4 && !needsVehicleStep) next = 5;
    saveStep(next);
  };

  const goBack = () => {
    let prev = step - 1;
    if (prev === 4 && !needsVehicleStep) prev = 3;
    setStep(prev);
  };

  const uploadDoc = async (documentType, file) => {
    if (!file) return;
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
    await api.post("/uploads/complete", { document_id, entity_type: "driver", expires_at: form[`${documentType}_expires`] || null });
    alert(`${documentType} uploaded`);
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
      advanceFromStep(step);
    } catch (e) {
      alert(e?.message || "Tax save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  const current = STEPS.find((s) => s.id === step) || STEPS[0];

  if (current.agreements) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-12">
          <ComplianceAgreementWizard roleLabel="Driver" onAllComplete={() => router.push("/pending-approval")} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="max-w-xl mx-auto px-6 py-12">
        <div className="label-eyebrow">Driver onboarding · Step {step} of {STEPS.length}</div>
        <h1 className="font-display text-3xl font-bold mt-2">{current.title}</h1>

        <div className="card p-6 mt-8 space-y-4">
          {current.deliveryMode && (
            <DeliveryModeStep
              onBack={step > 1 ? goBack : undefined}
              onComplete={(modes) => {
                setSelectedModes(modes);
                advanceFromStep(step);
              }}
            />
          )}

          {!current.deliveryMode && current.fields?.map((field) => (
            <div key={field}>
              <label className="label capitalize">{field.replace(/_/g, " ")}</label>
              <input
                className="input-field w-full"
                type={field.includes("date") || field.includes("expiration") ? "date" : field === "vehicle_year" ? "number" : "text"}
                value={form[field] || ""}
                onChange={(e) => set(field, e.target.value)}
              />
            </div>
          ))}

          {!current.deliveryMode && current.docTypes?.map((dt) => (
            <div key={dt}>
              <label className="label capitalize">{dt.replace(/_/g, " ")}</label>
              <input type="file" accept="image/*,application/pdf" className="input-field w-full" onChange={(e) => uploadDoc(dt, e.target.files?.[0])} />
            </div>
          ))}

          {!current.deliveryMode && current.tax && (
            <>
              <input className="input-field w-full" placeholder="SSN or EIN" value={form.tax_id || ""} onChange={(e) => set("tax_id", e.target.value)} />
              <select className="input-field w-full" value={form.tax_classification || "individual"} onChange={(e) => set("tax_classification", e.target.value)}>
                <option value="individual">Individual</option>
                <option value="sole_proprietor">Sole proprietor</option>
                <option value="llc">LLC</option>
              </select>
              <input className="input-field w-full" placeholder="W-9 signature (typed name)" value={form.tax_signature || ""} onChange={(e) => set("tax_signature", e.target.value)} />
            </>
          )}

          {!current.deliveryMode && (
            <div className="flex gap-3 pt-4">
              {step > 1 && (
                <button type="button" className="btn-ghost" disabled={busy} onClick={goBack}>Back</button>
              )}
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={busy}
                onClick={() => (current.tax ? submitTax() : advanceFromStep(step))}
              >
                {busy ? "Saving…" : step >= STEPS.length ? "Submit for review" : "Continue"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
