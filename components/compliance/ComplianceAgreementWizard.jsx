"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ElectronicSignature from "@/components/compliance/ElectronicSignature";
import DriverBackgroundCheckForm from "@/components/compliance/DriverBackgroundCheckForm";
import RestaurantApplicationForm from "@/components/compliance/RestaurantApplicationForm";
import DriverApplicationForm from "@/components/compliance/DriverApplicationForm";

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
const VENDOR_STEPS = ["application", "agreements"];

export default function ComplianceAgreementWizard({ roleLabel, onAllComplete }) {
  const { user } = useAuth();
  const role = user?.role === "vendor" || user?.role === "restaurant" ? "vendor" : "delivery";
  const steps = role === "vendor" ? VENDOR_STEPS : DRIVER_STEPS;

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
    Promise.all([
      api.get("/agreements/me"),
      role === "delivery" ? api.get("/compliance/background-check") : Promise.resolve(null),
      role === "delivery" ? api.get("/onboarding/driver") : api.get("/onboarding/restaurant"),
    ]).then(([agr, bg, app]) => {
      const list = Array.isArray(agr?.data) ? agr.data : [];
      setAgreements(list);
      const c = {};
      const s = {};
      list.forEach((a) => {
        if (a.accepted) c[a.type] = true;
        if (a.acceptance?.typed_name) s[a.type] = a.acceptance.typed_name;
      });
      setChecks(c);
      setSignatures(s);
      const appData = app?.data ?? app;
      setAppDone(Boolean(appData?.legal_name || appData?.business_name));
      const bgData = bg?.data ?? bg;
      setBgDone(Boolean(bgData?.submitted));
      const stillPending = list.filter((a) => a.required && !a.accepted);
      if (stillPending.length === 0 && list.length > 0) {
        onAllComplete?.();
      }
    }).catch((e) => setError(e?.message || "Failed to load"));
  }, [user, role, onAllComplete]);

  const currentStep = steps[step];
  const pending = agreements.filter((a) => a.required && !a.accepted);

  const allAgreementsReady = pending.every((a) => {
    const sig = esign[a.type] || {};
    const typed = (sig.typed_name || signatures[a.type] || "").trim();
    if (a.kind === "signature") return checks[a.type] && typed.length > 1;
    return checks[a.type];
  });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <span key={s} className={`badge ${i === step ? "ring-2 ring-[var(--primary)]" : i < step ? "opacity-100" : "opacity-50"}`}>
            {i + 1}. {s === "application" ? "Application" : s === "background" ? "Background check" : "Agreements"}
          </span>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {currentStep === "application" && role === "delivery" && (
        <DriverApplicationForm
          onComplete={() => { setAppDone(true); goNext(); }}
        />
      )}

      {currentStep === "application" && role === "vendor" && (
        <RestaurantApplicationForm
          onComplete={() => { setAppDone(true); goNext(); }}
        />
      )}

      {currentStep === "background" && role === "delivery" && (
        <DriverBackgroundCheckForm
          onComplete={() => { setBgDone(true); goNext(); }}
        />
      )}

      {currentStep === "agreements" && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Review each agreement, sign electronically, and check the consent box.
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
