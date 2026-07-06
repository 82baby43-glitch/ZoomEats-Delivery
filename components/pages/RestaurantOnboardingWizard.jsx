"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import RoleAgreementCenter from "@/components/pages/RoleAgreementCenter";
import { enhanceFoodPhoto } from "@/lib/compliance/imageEnhance";
import { Check, ExternalLink, Sparkles } from "lucide-react";

const STEPS = [
  { id: 1, title: "Business Information", fields: ["business_name", "cuisine", "description", "business_address", "phone"] },
  { id: 2, title: "Owner Verification", fields: ["owner_name", "owner_email"] },
  { id: 3, title: "Business Verification", docTypes: ["business_license", "health_permit"] },
  { id: 4, title: "Tax Information", tax: true },
  { id: 5, title: "Agreements", agreements: true },
  { id: 6, title: "Payout Setup", stripe: true },
  { id: 7, title: "AI Menu Upload", menu: true },
];

const STEP_LABELS = STEPS.map((s) => s.title);

export default function RestaurantOnboardingWizard() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [stripeStatus, setStripeStatus] = useState(null);
  const [menuItem, setMenuItem] = useState({ name: "", description: "", price: "", category: "Mains" });
  const [photoPreview, setPhotoPreview] = useState({ original: null, enhanced: null });
  const [uploadedDocs, setUploadedDocs] = useState({});

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api.get("/onboarding/restaurant");
      const d = r?.data;
      if (d?.current_step) setStep(d.current_step);
      setForm((f) => ({
        ...f,
        ...d,
        owner_email: d?.owner_email || d?.user_email || user.email,
        owner_name: d?.owner_name || user.name,
      }));
      if (d?.status === "pending_review") router.replace("/pending-approval");
    } catch {
      /* fresh onboarding */
    }
  }, [user, router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const urlStep = Number(searchParams.get("step"));
    if (urlStep >= 1 && urlStep <= STEPS.length) setStep(urlStep);
    if (searchParams.get("stripe") === "return") {
      api.get("/onboarding/restaurant/stripe-connect/status").then((r) => {
        setStripeStatus(r?.data);
        if (r?.data?.complete) setStep(7);
      }).catch(() => {});
    }
  }, [searchParams]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveStep = async (nextStep, extra = {}) => {
    setBusy(true);
    try {
      await api.post("/onboarding/restaurant", { step: nextStep, ...form, ...extra });
      setStep(nextStep);
      if (nextStep > STEPS.length) {
        await api.post("/onboarding/restaurant", { step: STEPS.length, ...form, finalize: true });
        router.push("/pending-approval");
      }
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
      await api.post("/onboarding/restaurant", { step, ...form });
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

  const submitTax = async () => {
    setBusy(true);
    try {
      await api.post("/onboarding/restaurant/tax", {
        legal_name: form.owner_name || form.business_name,
        business_name: form.business_name,
        sales_tax_id: form.sales_tax_id,
        ein: form.ein,
        tax_id: form.ein || form.tax_id,
        business_address: form.business_address,
        tax_classification: form.tax_classification || "business",
        signature: form.tax_signature,
      });
      await saveStep(step + 1);
    } catch (e) {
      alert(e?.message || "Tax save failed");
    } finally {
      setBusy(false);
    }
  };

  const startStripe = async () => {
    setBusy(true);
    try {
      const r = await api.post("/onboarding/restaurant/stripe-connect", {
        return_url: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      if (r?.data?.url) window.location.href = r.data.url;
      else alert("Stripe Connect unavailable");
    } catch (e) {
      alert(e?.message || "Stripe setup failed");
    } finally {
      setBusy(false);
    }
  };

  const enhanceAndPreview = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const originalUrl = URL.createObjectURL(file);
      const enhancedBlob = await enhanceFoodPhoto(file);
      const enhancedUrl = URL.createObjectURL(enhancedBlob);

      const uploadBlob = async (blob, suffix) => {
        const presign = await api.post("/uploads/presign", {
          document_type: `menu_photo_${suffix}`,
          file_name: `${suffix}.jpg`,
          content_type: "image/jpeg",
          entity_type: "restaurant",
        });
        const { upload_url, token } = presign?.data || {};
        await fetch(upload_url, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg", "x-upsert": "true", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: blob,
        });
        return presign?.data?.storage_path;
      };

      const [originalPath, enhancedPath] = await Promise.all([
        uploadBlob(file, "original"),
        uploadBlob(enhancedBlob, "enhanced"),
      ]);

      setPhotoPreview({ original: originalUrl, enhanced: enhancedUrl, originalPath, enhancedPath });
    } catch (e) {
      alert(e?.message || "Enhancement failed");
    } finally {
      setBusy(false);
    }
  };

  const approveMenuPhoto = async () => {
    setBusy(true);
    try {
      await api.post("/onboarding/restaurant/menu-enhance", {
        original_path: photoPreview.originalPath,
        enhanced_path: photoPreview.enhancedPath,
        approved: true,
        menu_item: {
          ...menuItem,
          price: parseFloat(menuItem.price) || 0,
          image_url: photoPreview.enhancedPath,
        },
      });
      setPhotoPreview({ original: null, enhanced: null });
      setMenuItem({ name: "", description: "", price: "", category: "Mains" });
      alert("Menu item added with enhanced photo!");
    } catch (e) {
      alert(e?.message || "Failed to save menu item");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  const current = STEPS.find((s) => s.id === step) || STEPS[0];

  if (current.agreements) {
    return (
      <RoleAgreementCenter
        roleLabel="Restaurant"
        onComplete={() => saveStep(step + 1)}
        stayOnComplete
      />
    );
  }

  return (
    <div>
      <Header />
      <div className="max-w-xl mx-auto px-6 py-12">
        <div className="label-eyebrow">Restaurant onboarding · Step {step} of {STEPS.length}</div>
        <h1 className="font-display text-3xl font-bold mt-2">{current.title}</h1>

        <div className="flex gap-1 mt-4 overflow-x-auto pb-2">
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className="text-xs px-2 py-1 rounded whitespace-nowrap"
              style={{
                background: i + 1 === step ? "var(--primary)" : i + 1 < step ? "var(--surface-2)" : "transparent",
                color: i + 1 === step ? "#0A0A0A" : "var(--muted)",
                border: i + 1 > step ? "1px solid var(--border)" : "none",
              }}
            >
              {i + 1 < step ? <Check size={10} className="inline mr-1" /> : null}{label}
            </div>
          ))}
        </div>

        <div className="card p-6 mt-6 space-y-4">
          {current.fields?.map((field) => (
            <div key={field}>
              <label className="label capitalize">{field.replace(/_/g, " ")}</label>
              {field === "description" ? (
                <textarea className="input-field w-full" rows={3} value={form[field] || ""} onChange={(e) => set(field, e.target.value)} />
              ) : (
                <input
                  className="input-field w-full"
                  type={field === "phone" ? "tel" : "text"}
                  value={form[field] || ""}
                  onChange={(e) => set(field, e.target.value)}
                  readOnly={field === "owner_email"}
                />
              )}
            </div>
          ))}

          {current.docTypes?.map((dt) => (
            <div key={dt}>
              <label className="label capitalize flex items-center gap-2">
                {dt.replace(/_/g, " ")}
                {uploadedDocs[dt] && <Check size={14} className="text-green-400" />}
              </label>
              <input type="file" accept="image/*,application/pdf" className="input-field w-full" onChange={(e) => uploadDoc(dt, e.target.files?.[0])} />
            </div>
          ))}

          {current.tax && (
            <>
              <input className="input-field w-full" placeholder="Sales Tax ID" value={form.sales_tax_id || ""} onChange={(e) => set("sales_tax_id", e.target.value)} />
              <input className="input-field w-full" placeholder="EIN" value={form.ein || ""} onChange={(e) => set("ein", e.target.value)} />
              <input className="input-field w-full" placeholder="W-9 signature (typed legal name)" value={form.tax_signature || ""} onChange={(e) => set("tax_signature", e.target.value)} />
            </>
          )}

          {current.stripe && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Connect your bank account via Stripe to receive payouts. Required before you can accept orders.
              </p>
              {stripeStatus?.complete ? (
                <p className="text-green-400 text-sm flex items-center gap-2"><Check size={16} /> Payout account connected</p>
              ) : (
                <button type="button" className="btn-primary w-full inline-flex items-center justify-center gap-2" disabled={busy} onClick={startStripe}>
                  <ExternalLink size={16} /> Connect with Stripe
                </button>
              )}
            </div>
          )}

          {current.menu && (
            <div className="space-y-4">
              <p className="text-sm flex items-center gap-2" style={{ color: "var(--muted)" }}>
                <Sparkles size={16} /> Upload a food photo — we&apos;ll enhance lighting, color, and sharpness for a menu-ready image.
              </p>
              <input className="input-field w-full" placeholder="Item name" value={menuItem.name} onChange={(e) => setMenuItem({ ...menuItem, name: e.target.value })} />
              <input className="input-field w-full" placeholder="Price" type="number" step="0.01" value={menuItem.price} onChange={(e) => setMenuItem({ ...menuItem, price: e.target.value })} />
              <input type="file" accept="image/*" className="input-field w-full" onChange={(e) => enhanceAndPreview(e.target.files?.[0])} />
              {photoPreview.original && photoPreview.enhanced && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>Original</p>
                    <img src={photoPreview.original} alt="Original" className="rounded-lg w-full aspect-square object-cover" />
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>AI Enhanced</p>
                    <img src={photoPreview.enhanced} alt="Enhanced" className="rounded-lg w-full aspect-square object-cover" />
                  </div>
                  <button type="button" className="btn-primary col-span-2" disabled={busy || !menuItem.name} onClick={approveMenuPhoto}>
                    Approve enhanced photo & add to menu
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            {step > 1 && (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>
            )}
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={busy}
              onClick={() => {
                if (current.tax) submitTax();
                else if (current.stripe) saveStep(step + 1);
                else if (current.menu) saveStep(step + 1, { finalize: true });
                else saveStep(step + 1);
              }}
            >
              {busy ? "Saving…" : step >= STEPS.length ? "Submit for review" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
