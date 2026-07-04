"use client";

import React, { useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

export default function DisclosureForm() {
  const [hasConviction, setHasConviction] = useState(false);
  const [offenseType, setOffenseType] = useState("");
  const [severity, setSeverity] = useState("");
  const [convictionDate, setConvictionDate] = useState("");
  const [state, setState] = useState("");
  const [explanation, setExplanation] = useState("");
  const [file, setFile] = useState(null);

  const submit = async () => {
    try {
      const payload = {
        has_conviction: hasConviction,
        offense_type: offenseType,
        severity,
        conviction_date: convictionDate || null,
        state,
        explanation,
      };
      const r = await api.post("/agreements/driver/disclosure", payload);
      const review_id = r?.data?.review_id;
      if (!review_id) {
        alert("Submit failed — no review id returned");
        return;
      }
      if (file) {
        const pres = await api.post(`/uploads/presign?filename=${encodeURIComponent(file.name)}&content_type=${encodeURIComponent(file.type)}`);
        const url = pres?.data?.url;
        if (!url) {
          alert("Upload setup failed");
          return;
        }
        await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        await api.post("/uploads/confirm", { disclosure_id: review_id, key: pres?.data?.key ?? "" });
      }
      alert("Disclosure submitted; review id: " + review_id);
    } catch (e) {
      console.warn(e);
      alert("Submit failed");
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-2xl font-bold">Criminal History Disclosure</h1>
        <div className="card p-6 mt-6 space-y-3">
          <label className="label">Have you been convicted of a felony or misdemeanor?</label>
          <div className="flex gap-4">
            <button className={hasConviction ? "btn-primary" : "btn-ghost"} onClick={() => setHasConviction(true)}>Yes</button>
            <button className={!hasConviction ? "btn-primary" : "btn-ghost"} onClick={() => setHasConviction(false)}>No</button>
          </div>
          {hasConviction && (
            <div>
              <input className="input-field mt-2" placeholder="Offense Type" value={offenseType} onChange={(e) => setOffenseType(e.target.value)} />
              <select className="input-field mt-2" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="">Severity</option>
                <option value="felony">Felony</option>
                <option value="misdemeanor">Misdemeanor</option>
              </select>
              <input className="input-field mt-2" type="date" value={convictionDate} onChange={(e) => setConvictionDate(e.target.value)} />
              <input className="input-field mt-2" placeholder="State of Conviction" value={state} onChange={(e) => setState(e.target.value)} />
              <textarea className="input-field mt-2" placeholder="Explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
              <div className="mt-2">
                <label className="label">Supporting Document (optional)</label>
                <input type="file" onChange={(e) => setFile(e.target.files[0])} />
              </div>
            </div>
          )}
          <div>
            <button className="btn-primary" onClick={submit}>Submit Disclosure</button>
          </div>
        </div>
      </div>
    </div>
  );
}
