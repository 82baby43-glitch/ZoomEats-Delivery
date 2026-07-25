"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ElectronicSignature from "@/components/compliance/ElectronicSignature";
import DriverBackgroundCheckForm from "@/components/compliance/DriverBackgroundCheckForm";
import RestaurantApplicationForm from "@/components/compliance/RestaurantApplicationForm";
import DriverApplicationForm from "@/components/compliance/DriverApplicationForm";
import MerchantCategoryPicker from "@/components/compliance/MerchantCategoryPicker";
import { categoryLabel, isAgeRestrictedCategory, isSignupExcludedSlug, resolveSignupCategorySlug, RESTAURANT_SLUG } from "@/lib/merchant/categoryConfig";

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

export default function ComplianceAgreementWizard({ roleLabel, onAllComplete, initialMerchantCategory = null }) {
  const { user } = useAuth();
  const role = user?.role === "vendor" || user?.role === "restaurant" ? "vendor" : "delivery";

  const [merchantCategory, setMerchantCategory] = useState(initialMerchantCategory || "restaurants");
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
  const [storedCategoryExcluded, setStoredCategoryExcluded] = useState(false);

  useEffect(() => {
    if (!user || role !== "vendor" || !initialMerchantCategory || categoryLocked) return;
    (async () => {
      try {
        await api.post("/onboarding/restaurant", {
          merchant_category_slug: initialMerchantCategory,
          status: "category_selected",
        });
        setMerchantCategory(initialMerchantCategory);
        setCategoryLocked(true);
        const agrRes = await api.get("/agreements/me", { params: { merchant_category: initialMerchantCategory } });
        setAgreements(Array.isArray(agrRes?.data) ? agrRes.data : []);
      } catch {
        // category preselect is best-effort; user can still pick manually
      }
    })();
  }, [user, role, initialMerchantCategory, categoryLocked]);

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
        const storedSlug = appData?.merchant_category_slug || null;
        const signupSlug = resolveSignupCategorySlug(storedSlug, initialMerchantCategory);
        const hasApplication = Boolean(appData?.business_name);
        const hasValidCategory = Boolean(signupSlug);

        if (role === "vendor") {
          setStoredCategoryExcluded(Boolean(storedSlug && isSignupExcludedSlug(storedSlug)));
          setMerchantCategory(signupSlug || RESTAURANT_SLUG);
          if (hasValidCategory && hasApplication) {
            setCategoryLocked(true);
            setSteps(VENDOR_STEPS_RESTAURANT);
          } else if (hasValidCategory) {
            setCategoryLocked(Boolean(initialMerchantCategory));
            setSteps(["application", "agreements"]);
          } else {
            setCategoryLocked(false);
            setSteps(VENDOR_STEPS_WITH_CATEGORY);
          }
        }

        const agrRes = role === "vendor"
          ? await api.get("/agreements/me", { params: { merchant_category: signupSlug || RESTAURANT_SLUG } })
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
      } catch (e) {
        setError(e?.message || "Failed to load");
      }
    })();
  }, [user, role, onAllComplete, initialMerchantCategory]);

  const currentStep = steps[step];
  const pending = agreements.filter((a) => a.required && !a.accepted);

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
        <>
          {storedCategoryExcluded && (
            <p className="text-sm text-amber-400">
              Your previous business type is no longer available for public signup. Please choose a restaurant or retail category below.
            </p>
          )}
          <MerchantCategoryPicker
            value={merchantCategory}
            onChange={setMerchantCategory}
            onContinue={saveCategory}
          />
        </>
      )}

      {currentStep === "application" && role === "delivery" && (
        <DriverApplicationForm onComplete={() => { setAppDone(true); goNext(); }} />
      )}

      {currentStep === "application" && role === "vendor" && (
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
            {isAgeRestrictedCategory(merchantCategory) && ` ${categoryLabel(merchantCategory)} merchants require additional compliance agreements.`}
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
