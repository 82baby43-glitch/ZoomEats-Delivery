"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import ElectronicSignature from "@/components/compliance/ElectronicSignature";

const EMPTY_OFFENSE = { offense_type: "", severity: "", conviction_date: "", state: "", explanation: "" };

export default function DriverBackgroundCheckForm({ onComplete, initial = {} }) {
  const [form, setForm] = useState({
    legal_name: "",
    date_of_birth: "",
    address_line1: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    license_number: "",
    license_state: "",
    has_criminal_history: false,
    offenses: [],
    fcra_authorization: false,
    mvr_authorization: false,
    ...initial,
  });
  const [signature, setSignature] = useState({ typed_name: "", signature_image: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get("/compliance/background-check").then((r) => {
      const d = r?.data ?? r;
      setStatus(d);
      if (d?.disclosure) setForm((f) => ({ ...f, ...d.disclosure }));
    }).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (!form.fcra_authorization || !form.mvr_authorization) {
        throw new Error("FCRA and MVR authorizations are required");
      }
      const name = signature.typed_name || form.legal_name;
      if (!name?.trim()) throw new Error("Legal name and signature required");
      const res = await api.post("/compliance/background-check", {
        ...form,
        disclosure_signature: name.trim(),
        signature_image: signature.signature_image || null,
      });
      setStatus(res?.data ?? res);
      onComplete?.(res?.data ?? res);
    } catch (e) {
      setError(e?.message || "Background check submission failed");
    } finally {
      setBusy(false);
    }
  };

  if (status?.submitted) {
    return (
      <div className="card p-5 text-sm space-y-2">
        <p className="font-bold text-green-400">Background check form submitted</p>
        <p style={{ color: "var(--muted)" }}>Status: {status.check_status || "pending"} · We will notify you when review is complete.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="driver-background-check-form">
      <div>
        <h3 className="font-bold text-lg">Background Check &amp; MVR Authorization</h3>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Federal and state law requires disclosure before a consumer report or motor vehicle record is obtained for employment purposes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="input-field" placeholder="Legal full name" value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
        <input className="input-field" type="date" placeholder="Date of birth" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
        <input className="input-field md:col-span-2" placeholder="Current street address" value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} />
        <input className="input-field" placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
        <input className="input-field" placeholder="State" value={form.state} onChange={(e) => set("state", e.target.value)} />
        <input className="input-field" placeholder="ZIP" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
        <input className="input-field" placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        <input className="input-field" placeholder="Driver license number" value={form.license_number} onChange={(e) => set("license_number", e.target.value)} />
        <input className="input-field" placeholder="License state" value={form.license_state} onChange={(e) => set("license_state", e.target.value)} />
      </div>

      <div className="card p-4 text-sm space-y-3" style={{ borderColor: "var(--border)" }}>
        <p className="font-bold">FCRA Disclosure</p>
        <p style={{ color: "var(--muted)" }}>
          ZoomEats may obtain a consumer report and/or investigative consumer report about you from a consumer reporting agency for purposes of evaluating your eligibility as an independent delivery contractor. You have the right to request disclosure of the nature and scope of any investigative consumer report and to dispute inaccurate information.
        </p>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={form.fcra_authorization} onChange={(e) => set("fcra_authorization", e.target.checked)} />
          <span>I authorize ZoomEats to obtain consumer reports for driver eligibility screening.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={form.mvr_authorization} onChange={(e) => set("mvr_authorization", e.target.checked)} />
          <span>I authorize review of my motor vehicle record (MVR) and driving history.</span>
        </label>
      </div>

      <div className="card p-4 space-y-3">
        <p className="font-bold text-sm">Criminal history disclosure</p>
        <div className="flex gap-3">
          <button type="button" className={form.has_criminal_history ? "btn-primary text-xs" : "btn-ghost text-xs"} onClick={() => set("has_criminal_history", true)}>Yes — I have convictions</button>
          <button type="button" className={!form.has_criminal_history ? "btn-primary text-xs" : "btn-ghost text-xs"} onClick={() => set("has_criminal_history", false)}>No convictions</button>
        </div>
        {form.has_criminal_history && (
          <div className="space-y-2">
            {(form.offenses?.length ? form.offenses : [EMPTY_OFFENSE]).map((off, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input className="input-field text-sm" placeholder="Offense type" value={off.offense_type} onChange={(e) => {
                  const offenses = [...(form.offenses?.length ? form.offenses : [EMPTY_OFFENSE])];
                  offenses[i] = { ...offenses[i], offense_type: e.target.value };
                  set("offenses", offenses);
                }} />
                <select className="input-field text-sm" value={off.severity} onChange={(e) => {
                  const offenses = [...(form.offenses?.length ? form.offenses : [EMPTY_OFFENSE])];
                  offenses[i] = { ...offenses[i], severity: e.target.value };
                  set("offenses", offenses);
                }}>
                  <option value="">Severity</option>
                  <option value="felony">Felony</option>
                  <option value="misdemeanor">Misdemeanor</option>
                </select>
                <input className="input-field text-sm" type="date" value={off.conviction_date} onChange={(e) => {
                  const offenses = [...(form.offenses?.length ? form.offenses : [EMPTY_OFFENSE])];
                  offenses[i] = { ...offenses[i], conviction_date: e.target.value };
                  set("offenses", offenses);
                }} />
                <input className="input-field text-sm" placeholder="State" value={off.state} onChange={(e) => {
                  const offenses = [...(form.offenses?.length ? form.offenses : [EMPTY_OFFENSE])];
                  offenses[i] = { ...offenses[i], state: e.target.value };
                  set("offenses", offenses);
                }} />
                <textarea className="input-field text-sm md:col-span-2" rows={2} placeholder="Explanation" value={off.explanation} onChange={(e) => {
                  const offenses = [...(form.offenses?.length ? form.offenses : [EMPTY_OFFENSE])];
                  offenses[i] = { ...offenses[i], explanation: e.target.value };
                  set("offenses", offenses);
                }} />
              </div>
            ))}
            <button type="button" className="btn-ghost text-xs" onClick={() => set("offenses", [...(form.offenses || []), { ...EMPTY_OFFENSE }])}>Add another offense</button>
          </div>
        )}
      </div>

      <ElectronicSignature value={signature} onChange={setSignature} label="Sign to authorize background and MVR screening" />

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" className="btn-primary" disabled={busy} onClick={submit} data-testid="background-check-submit">
        {busy ? "Submitting…" : "Submit background check authorization"}
      </button>
    </div>
  );
}
