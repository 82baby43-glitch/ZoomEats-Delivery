"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ElectronicSignature from "@/components/compliance/ElectronicSignature";
import DriverBackgroundCheckForm from "@/components/compliance/DriverBackgroundCheckForm";
import RestaurantApplicationForm from "@/components/compliance/RestaurantApplicationForm";
import DriverApplicationForm from "@/components/compliance/DriverApplicationForm";
import MerchantCategoryPicker from "@/components/compliance/MerchantCategoryPicker";
import DispensaryApplicationForm from "@/components/compliance/DispensaryApplicationForm";

function clientMeta() {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  return {
    user_agent: ua,
    browser: /Chrome|Firefox|Safari|Edge/.exec(ua)?.[0] || "unknown",
    device: /Mobile|Android|iPhone/i.test(ua) ? "mobile" : "desktop",
  };
}

const DRIVER_STEPS = ["application", "background", "agreements"];
const VENDOR_STEPS_RESTAURANT = ["application", "agreements"];
const VENDOR_STEPS_WITH_CATEGORY = ["category", "application", "agreements"];

export default function ComplianceAgreementWizard({ roleLabel, onAllComplete }) {
  const { user } = useAuth();
  const role = user?.role === "vendor" || user?.role === "restaurant" ? "vendor" : "delivery";

  const [merchantCategory, setMerchantCategory] = useState("restaurants");
  const [categoryLocked, setCategoryLocked] = useState(false);
  const [steps, setSteps] = useState(role === "vendor" ? VENDOR_STEPS_WITH_CATEGORY : DRIVER_STEPS);
  const [step, setStep] = useState(0);
  const [agreements, setAgreements] = useState([]);
  const [checks, setChecks] = useState({});
  const [signatures, setSignatures] = useState({});
  const [esign, setEsign] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [appDone, setAppDone] = useState(false);
  const [bgDone, setBgDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const appEndpoint = role === "delivery" ? "/onboarding/driver" : "/onboarding/restaurant";
        const [bg, app] = await Promise.all([
          role === "delivery" ? api.get("/compliance/background-check") : Promise.resolve(null),
          api.get(appEndpoint),
        ]);
        const appData = app?.data ?? app;
        const slug = appData?.merchant_category_slug || "restaurants";
        const hasApplication = Boolean(appData?.business_name);
        const hasCategory = Boolean(appData?.merchant_category_slug);

        if (role === "vendor") {
          setMerchantCategory(slug);
          if (hasCategory && hasApplication) {
            setCategoryLocked(true);
            setSteps(VENDOR_STEPS_RESTAURANT);
          } else if (hasCategory) {
            setCategoryLocked(true);
            setSteps(["application", "agreements"]);
          } else {
            setSteps(VENDOR_STEPS_WITH_CATEGORY);
          }
        }

        const agrRes = role === "vendor"
          ? await api.get("/agreements/me", { params: { merchant_category: slug } })
          : await api.get("/agreements/me");
        const list = Array.isArray(agrRes?.data) ? agrRes.data : [];
        setAgreements(list);
        const c = {};
        const s = {};
        list.forEach((a) => {
          if (a.accepted) c[a.type] = true;
          if (a.acceptance?.typed_name) s[a.type] = a.acceptance.typed_name;
        });
        setChecks(c);
        setSignatures(s);
        setAppDone(hasApplication);
        const bgData = bg?.data ?? bg;
        setBgDone(Boolean(bgData?.submitted));
        const stillPending = list.filter((a) => a.required && !a.accepted);
        if (stillPending.length === 0 && list.length > 0) onAllComplete?.();
      } catch (e) {
        setError(e?.message || "Failed to load");
      }
    })();
  }, [user, role, onAllComplete]);

  const currentStep = steps[step];
  const pending = agreements.filter((a) => a.required && !a.accepted);
  const isDispensary = merchantCategory === "licensed_dispensary";

  const allAgreementsReady = pending.every((a) => {
    const sig = esign[a.type] || {};
    const typed = (sig.typed_name || signatures[a.type] || "").trim();
    if (a.kind === "signature") return checks[a.type] && typed.length > 1;
    return checks[a.type];
  });

  const saveCategory = async () => {
    if (!merchantCategory) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/onboarding/restaurant", {
        merchant_category_slug: merchantCategory,
        status: "category_selected",
      });
      setCategoryLocked(true);
      const agrRes = await api.get("/agreements/me", { params: { merchant_category: merchantCategory } });
      setAgreements(Array.isArray(agrRes?.data) ? agrRes.data : []);
      setStep(step + 1);
    } catch (e) {
      setError(e?.message || "Could not save category");
    } finally {
      setBusy(false);
    }
  };

  const submitAgreements = async () => {
    setBusy(true);
    setError("");
    try {
      const meta = clientMeta();
      const batch = pending.map((a) => {
        const sig = esign[a.type] || {};
        return {
          agreement_type: a.type,
          typed_name: sig.typed_name || signatures[a.type] || user?.name || "",
          signature_image: sig.signature_image || null,
          consent_checkbox: Boolean(checks[a.type]),
          ...meta,
        };
      });
      await api.post("/agreements/batch-accept", { agreements: batch, ...meta });
      onAllComplete?.();
    } catch (e) {
      setError(e?.message || "Failed to save agreements");
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    if (step < steps.length - 1) setStep(step + 1);
  };

  const stepLabel = (s) => {
    if (s === "category") return "Business type";
    if (s === "application") return "Application";
    if (s === "background") return "Background check";
    return "Agreements";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <span key={s} className={`badge ${i === step ? "ring-2 ring-[var(--primary)]" : i < step ? "opacity-100" : "opacity-50"}`}>
            {i + 1}. {stepLabel(s)}
          </span>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {currentStep === "category" && role === "vendor" && !categoryLocked && (
        <MerchantCategoryPicker
          value={merchantCategory}
          onChange={setMerchantCategory}
          onContinue={saveCategory}
        />
      )}

      {currentStep === "application" && role === "delivery" && (
        <DriverApplicationForm onComplete={() => { setAppDone(true); goNext(); }} />
      )}

      {currentStep === "application" && role === "vendor" && isDispensary && (
        <DispensaryApplicationForm onComplete={() => { setAppDone(true); goNext(); }} />
      )}

      {currentStep === "application" && role === "vendor" && !isDispensary && (
        <RestaurantApplicationForm
          merchantCategorySlug={merchantCategory}
          onComplete={() => { setAppDone(true); goNext(); }}
        />
      )}

      {currentStep === "background" && role === "delivery" && (
        <DriverBackgroundCheckForm onComplete={() => { setBgDone(true); goNext(); }} />
      )}

      {currentStep === "agreements" && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Review each agreement, sign electronically, and check the consent box.
            {isDispensary && " Licensed dispensary merchants require additional compliance agreements."}
          </p>
          {agreements.map((a) => (
            <div key={a.type} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold">{a.title}</h3>
                  <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{a.body}</p>
                  {a.accepted && <p className="text-xs mt-2 text-green-400">Accepted</p>}
                </div>
                {a.required && !a.accepted && <span className="text-xs font-bold text-amber-400">Required</span>}
              </div>
              {!a.accepted && (
                <div className="mt-4 space-y-3">
                  {a.kind === "signature" && (
                    <ElectronicSignature
                      value={esign[a.type] || { typed_name: signatures[a.type] || "" }}
                      onChange={(v) => setEsign((prev) => ({ ...prev, [a.type]: v }))}
                      label={`Sign: ${a.title}`}
                    />
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(checks[a.type])}
                      onChange={() => setChecks((prev) => ({ ...prev, [a.type]: !prev[a.type] }))}
                    />
                    I have read and agree to the {a.title}
                  </label>
                </div>
              )}
            </div>
          ))}

          {pending.length > 0 ? (
            <button className="btn-primary" disabled={!allAgreementsReady || busy} onClick={submitAgreements} data-testid="submit-all-agreements">
              {busy ? "Saving…" : "Submit all agreements"}
            </button>
          ) : (
            <p className="text-green-400">All agreements complete.</p>
          )}
        </div>
      )}

      {step > 0 && currentStep !== "agreements" && (
        <button type="button" className="btn-ghost text-sm" onClick={() => setStep(step - 1)}>Back</button>
      )}

      {appDone && currentStep === "application" && (
        <button type="button" className="btn-secondary text-sm" onClick={goNext}>Continue to next step</button>
      )}
      {bgDone && currentStep === "background" && (
        <button type="button" className="btn-secondary text-sm" onClick={goNext}>Continue to agreements</button>
      )}
    </div>
  );
}
