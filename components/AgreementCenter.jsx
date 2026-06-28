"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function AgreementCenter({ onComplete = null }) {
  const [agreements, setAgreements] = useState([]);
  const [acceptedTypes, setAcceptedTypes] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentAgreement, setCurrentAgreement] = useState(null);
  const [typedName, setTypedName] = useState("");
  const [consentCheckbox, setConsentCheckbox] = useState(false);

  useEffect(() => {
    loadAgreements();
    loadAcceptances();
  }, []);

  const loadAgreements = async () => {
    try {
      const res = await api.get("/agreements/all");
      setAgreements(res.data || []);
    } catch (e) {
      console.error("Failed to load agreements:", e);
      setError("Failed to load agreements");
    } finally {
      setLoading(false);
    }
  };

  const loadAcceptances = async () => {
    try {
      const res = await api.get("/agreements/me");
      const types = new Set((res.data || []).map((a) => a.agreement_type));
      setAcceptedTypes(types);
    } catch (e) {
      console.warn("Failed to load acceptances:", e);
    }
  };

  const handleAccept = async () => {
    if (!typedName.trim() || !consentCheckbox) {
      setError("Please enter your name and confirm consent");
      return;
    }
    try {
      await api.post("/agreements/accept", {
        agreement_type: currentAgreement.agreement_type,
        agreement_id: currentAgreement.agreement_id,
        typed_name: typedName,
        consent_checkbox: consentCheckbox,
      });
      setAcceptedTypes(new Set([...acceptedTypes, currentAgreement.agreement_type]));
      setCurrentAgreement(null);
      setTypedName("");
      setConsentCheckbox(false);
      await loadAcceptances();
      if (onComplete) onComplete();
    } catch (e) {
      setError("Failed to accept agreement: " + (e.response?.data || e.message));
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: "var(--primary)" }} />
        </div>
      </div>
    );
  }

  if (currentAgreement) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-black tracking-tighter mb-6">{currentAgreement.title}</h1>
        <div className="card p-6 mb-6 max-h-96 overflow-y-auto" style={{ whiteSpace: "pre-wrap" }}>
          {currentAgreement.body}
        </div>
        {error && (
          <div className="card p-4 mb-6" style={{ background: "var(--surface-2)", borderLeft: "4px solid var(--primary)" }}>
            <div className="flex gap-3">
              <AlertCircle size={20} style={{ color: "var(--primary)" }} />
              <div className="text-sm">{error}</div>
            </div>
          </div>
        )}
        <div className="space-y-4 mb-6">
          <input
            className="input-field"
            type="text"
            placeholder="Enter your full legal name"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
          />
          <label className="flex items-center gap-3 p-4 card cursor-pointer">
            <input
              type="checkbox"
              checked={consentCheckbox}
              onChange={(e) => setConsentCheckbox(e.target.checked)}
              className="w-5 h-5"
            />
            <span>I acknowledge and accept these terms</span>
          </label>
        </div>
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={() => setCurrentAgreement(null)}>
            Back
          </button>
          <button className="btn-primary flex-1" onClick={handleAccept}>
            Accept & Sign
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl font-black tracking-tighter mb-2">Agreement Center</h1>
      <p className="mb-8" style={{ color: "var(--muted)" }}>
        Review and accept all required agreements to activate your account.
      </p>
      <div className="space-y-3">
        {agreements.map((agr) => {
          const isAccepted = acceptedTypes.has(agr.agreement_type);
          return (
            <div key={agr.agreement_id} className="card p-5 flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                {isAccepted ? (
                  <CheckCircle2 size={24} style={{ color: "var(--primary)" }} />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2" style={{ borderColor: "var(--border)" }} />
                )}
                <div>
                  <div className="font-bold">{agr.title}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    Version {agr.version}
                    {isAccepted && " · Accepted"}
                  </div>
                </div>
              </div>
              {!isAccepted && (
                <button
                  className="btn-primary !py-2 !px-4"
                  onClick={() => {
                    setCurrentAgreement(agr);
                    setError(null);
                  }}
                >
                  Review & Accept
                </button>
              )}
            </div>
          );
        })}
      </div>
      {agreements.every((a) => acceptedTypes.has(a.agreement_type)) && (
        <div className="card p-6 mt-8 text-center" style={{ background: "var(--surface-2)" }}>
          <CheckCircle2 size={32} style={{ color: "var(--primary)", margin: "0 auto" }} className="mb-3" />
          <div className="font-bold">All agreements accepted</div>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            You're all set! You can now access your account.
          </p>
        </div>
      )}
    </div>
  );
}
