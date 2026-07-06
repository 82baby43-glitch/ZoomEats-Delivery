"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/safeData";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function TaxDashboard({ year: yearProp }) {
  const [year, setYear] = useState(yearProp || new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/tax/dashboard", { params: { year: String(year) } });
      setData(res?.data || null);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const uploadW9 = async (file) => {
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const presign = await api.post("/tax/w9/presign", {
        file_name: file.name,
        content_type: file.type || "application/pdf",
      });
      const uploadUrl = presign?.data?.upload_url;
      const storagePath = presign?.data?.storage_path;
      if (!uploadUrl || !storagePath) throw new Error("Could not prepare upload");

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload failed");

      await api.post("/tax/w9/submit", { path: storagePath });
      setMessage("W-9 uploaded securely.");
      await load();
    } catch (e) {
      setMessage(e?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);
  const w9 = data?.w9;
  const payments = Array.isArray(data?.payments) ? data.payments : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Tax &amp; 1099</h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            W-9 on file, year-to-date payments, and 1099 eligibility.
          </p>
        </div>
        <select
          className="input-field"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ width: 120 }}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>Loading tax summary…</div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="label-eyebrow">YTD payments ({year})</div>
              <div className="font-display text-3xl font-bold">${formatMoney(data?.total_payments || 0)}</div>
              <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                {payments.length} payment{payments.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="card p-5">
              <div className="label-eyebrow">1099 threshold</div>
              <div className="font-display text-3xl font-bold">${data?.threshold || 600}</div>
              <div className="text-xs mt-2" style={{ color: data?.requires_1099 ? "#eab308" : "var(--muted)" }}>
                {data?.requires_1099 ? "You may receive a 1099-NEC" : "Below reporting threshold"}
              </div>
            </div>
            <div className="card p-5">
              <div className="label-eyebrow">W-9 status</div>
              <div className="font-display text-xl font-bold">
                {w9?.on_file ? "On file" : "Missing"}
              </div>
              <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                {w9?.tin_masked ? `TIN ${w9.tin_masked}` : "No TIN on file"}
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-2 font-bold">
              <FileText size={18} />
              W-9 document
            </div>
            {w9 ? (
              <div className="text-sm space-y-1" style={{ color: "var(--muted)" }}>
                <p>Legal name: {w9.legal_name || "—"}</p>
                <p>Classification: {w9.tax_classification || "—"}</p>
                <p>Signed: {formatDate(w9.w9_signed_at)}</p>
                <p>Status: {w9.status || (w9.on_file ? "on_file" : "pending")}</p>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Complete onboarding tax info or upload a signed W-9 PDF below.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => uploadW9(e.target.files?.[0])}
              />
              <button
                type="button"
                className="btn-primary text-sm inline-flex items-center gap-2"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} />
                {uploading ? "Uploading…" : "Upload W-9 PDF"}
              </button>
              {message && <span className="text-sm" style={{ color: "var(--muted)" }}>{message}</span>}
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              W-9 files are stored in a private, encrypted bucket. Only admins can access them for year-end reporting.
            </p>
          </div>

          {payments.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--surface-2)" }}>
                  <tr>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Description</th>
                    <th className="text-right p-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.payment_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-3">{formatDate(p.paid_at)}</td>
                      <td className="p-3 capitalize">{String(p.payment_type || "").replace(/_/g, " ")}</td>
                      <td className="p-3" style={{ color: "var(--muted)" }}>{p.description || "—"}</td>
                      <td className="p-3 text-right font-bold">${formatMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
