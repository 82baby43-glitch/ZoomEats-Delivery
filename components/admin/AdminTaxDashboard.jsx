"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/safeData";

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function W9Badge({ onFile }) {
  return (
    <span className="badge" style={{ color: onFile ? "#22c55e" : "#ef4444" }}>
      {onFile ? "W-9 on file" : "Missing W-9"}
    </span>
  );
}

export default function AdminTaxDashboard() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/tax/dashboard", { params: { year: String(year) } });
      setData(res?.data || null);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const syncPayments = async () => {
    setSyncing(true);
    try {
      await api.post("/admin/tax/sync-payments", { year });
      await load();
    } catch (e) {
      alert("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const exportCsv = async (kind) => {
    setExporting(kind);
    try {
      const path = kind === "irs" ? "/admin/tax/export/irs-csv" : "/admin/tax/export/1099-nec";
      const res = await api.get(path, { params: { year: String(year) } });
      downloadBlob(res?.data?.csv || "", res?.data?.filename || `tax-${year}.csv`, "text/csv");
    } catch (e) {
      alert("Export failed");
    } finally {
      setExporting(null);
    }
  };

  const generateYearEnd = async () => {
    setGenerating(true);
    try {
      const res = await api.get("/admin/tax/year-end", { params: { year: String(year) } });
      alert(`Year-end report saved (${res?.data?.report_id || "ok"}) — ${res?.data?.contractors?.length || 0} contractors`);
      await load();
    } catch (e) {
      alert("Year-end report failed");
    } finally {
      setGenerating(false);
    }
  };

  const stats = data?.stats;
  const contractors = Array.isArray(data?.contractors) ? data.contractors : [];
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const statTiles = stats ? [
    ["Contractors", stats.contractor_count],
    ["Total payments", `$${formatMoney(stats.total_payments)}`],
    ["Requires 1099", stats.requires_1099_count],
    ["Missing W-9", stats.missing_w9_count],
    ["W-9 on file", stats.w9_on_file_count],
    ["Threshold", `$${stats.threshold}`],
  ] : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="input-field"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ width: 120 }}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" className="btn-ghost text-sm" onClick={syncPayments} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync wallet payments"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost text-sm inline-flex items-center gap-2"
            onClick={() => exportCsv("1099")}
            disabled={exporting}
          >
            <Download size={14} />
            {exporting === "1099" ? "Exporting…" : "1099-NEC CSV"}
          </button>
          <button
            type="button"
            className="btn-ghost text-sm inline-flex items-center gap-2"
            onClick={() => exportCsv("irs")}
            disabled={exporting}
          >
            <FileSpreadsheet size={14} />
            {exporting === "irs" ? "Exporting…" : "IRS-ready CSV"}
          </button>
          <button type="button" className="btn-primary text-sm" onClick={generateYearEnd} disabled={generating}>
            {generating ? "Generating…" : "Generate year-end report"}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>Loading tax dashboard…</div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {statTiles.map(([label, val]) => (
                <div key={label} className="card p-4 text-center">
                  <div className="text-xl font-bold">{val}</div>
                  <div className="text-[10px] mt-1 uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {data?.missing_w9?.length > 0 && (
            <div className="card p-4 border-l-4" style={{ borderColor: "#ef4444" }}>
              <div className="font-bold text-sm">{data.missing_w9.length} contractor(s) need W-9 for 1099 filing</div>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                Payments meet the ${stats?.threshold || 600} threshold but W-9 is not on file.
              </p>
            </div>
          )}

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <th className="text-left p-3">Contractor</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">TIN</th>
                  <th className="text-right p-3">YTD payments</th>
                  <th className="text-left p-3">1099</th>
                  <th className="text-left p-3">W-9</th>
                </tr>
              </thead>
              <tbody>
                {contractors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center" style={{ color: "var(--muted)" }}>
                      No contractor payment data for {year}.
                    </td>
                  </tr>
                ) : contractors.map((c) => (
                  <tr key={c.user_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-3">
                      <div className="font-bold">{c.legal_name || c.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>{c.email}</div>
                    </td>
                    <td className="p-3 capitalize">{c.entity_type}</td>
                    <td className="p-3 font-mono text-xs">{c.tin_masked}</td>
                    <td className="p-3 text-right font-bold">${formatMoney(c.total_payments)}</td>
                    <td className="p-3">
                      {c.requires_1099 ? (
                        <span className="badge" style={{ color: "#eab308" }}>1099</span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                    <td className="p-3"><W9Badge onFile={c.w9_on_file} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
