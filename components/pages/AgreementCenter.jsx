"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Header from "@/components/Header";

export default function AgreementCenter() {
  const [agreements, setAgreements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await api.get("/agreements/me");
        setAgreements(r.data || []);
      } catch (e) {
        console.warn("load agreements failed", e);
      }
    };
    load();
  }, []);

  const accept = async () => {
    if (!selected) return alert("Select an agreement type to accept");
    try {
      const res = await api.post("/agreements/accept", { agreement_type: selected, typed_name: name, consent_checkbox: consent });
      alert("Accepted: " + res.data.acceptance_id);
    } catch (e) {
      alert("Accept failed: " + (e.response?.data || e.message));
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-bold">Agreement Center</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>Review and accept platform agreements to continue onboarding.</p>
        <div className="card p-6 mt-6">
          <label className="label">Agreement Type</label>
          <select className="input-field" value={selected || ""} onChange={(e) => setSelected(e.target.value)}>
            <option value="">-- select --</option>
            <option value="terms">Terms of Service</option>
            <option value="privacy">Privacy Policy</option>
            <option value="driver_agreement">Driver Agreement</option>
            <option value="restaurant_agreement">Restaurant Agreement</option>
            <option value="electronic_records">Electronic Records Consent</option>
          </select>
          <label className="label mt-4">Typed Legal Name</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="mt-4 flex items-center gap-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <div className="text-sm">I consent to the selected agreement</div>
          </div>
          <div className="mt-4">
            <button className="btn-primary" onClick={accept}>Accept</button>
          </div>
        </div>
      </div>
    </div>
  );
}
