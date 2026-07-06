"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import ApprovalsTab from "@/components/admin/ApprovalsTab";
import ComplianceDossier from "@/components/admin/ComplianceDossier";

const ISSUE_LABELS = {
  missing_agreements: "Missing agreements",
  expired_license: "Expired license",
  expired_insurance: "Expired insurance",
  expiring_license: "License expiring",
  expiring_insurance: "Insurance expiring",
  pending_approval: "Pending approval",
  pending_background_check: "Pending BG check",
  payout_incomplete: "Payout incomplete",
};

function StatusBadge({ status }) {
  const color = status === "approved" ? "#22c55e" : status === "rejected" ? "#ef4444" : "#eab308";
  return <span className="badge capitalize" style={{ color }}>{status?.replace(/_/g, " ") || "—"}</span>;
}

function ScoreBadge({ score }) {
  const color = score >= 100 ? "#22c55e" : score >= 70 ? "#eab308" : "#ef4444";
  return <span className="font-bold" style={{ color }}>{score}%</span>;
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PartnerTable({ title, rows, onReview }) {
  if (!rows.length) {
    return (
      <div className="card p-6 text-center text-sm" style={{ color: "var(--muted)" }}>
        No {title.toLowerCase()} match the current filters.
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead style={{ background: "var(--surface-2)" }}>
          <tr>
            <th className="text-left p-3">Partner</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Score</th>
            <th className="text-left p-3">Agreements</th>
            <th className="text-left p-3">License</th>
            <th className="text-left p-3">Insurance</th>
            <th className="text-left p-3">BG Check</th>
            <th className="text-left p-3">Payout</th>
            <th className="text-left p-3">Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.user_id}
              className="border-t cursor-pointer hover:opacity-80"
              style={{ borderColor: "var(--border)" }}
              onClick={() => onReview(r.user_id)}
            >
              <td className="p-3">
                <div className="font-bold">{r.entity_name || r.name}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{r.email}</div>
              </td>
              <td className="p-3"><StatusBadge status={r.approval_status} /></td>
              <td className="p-3"><ScoreBadge score={r.compliance_score} /></td>
              <td className="p-3">{r.missing_agreements.length ? `${r.missing_agreements.length} missing` : "✓"}</td>
              <td className="p-3">
                {r.expired_licenses ? <span style={{ color: "#ef4444" }}>{r.expired_licenses} expired</span>
                  : r.expiring_licenses ? <span style={{ color: "#eab308" }}>expiring</span> : "✓"}
              </td>
              <td className="p-3">
                {r.expired_insurance ? <span style={{ color: "#ef4444" }}>{r.expired_insurance} expired</span>
                  : r.expiring_insurance ? <span style={{ color: "#eab308" }}>expiring</span> : "✓"}
              </td>
              <td className="p-3 capitalize">{r.background_check_status || "—"}</td>
              <td className="p-3">{r.payout_ready ? "Ready" : "Incomplete"}</td>
              <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                {r.issues.slice(0, 2).map((i) => ISSUE_LABELS[i] || i).join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminComplianceDashboard() {
  const [overview, setOverview] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dossierUser, setDossierUser] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [issue, setIssue] = useState("all");
  const [auditEvent, setAuditEvent] = useState("all");

  const filterParams = useMemo(() => {
    const p = {};
    if (search.trim()) p.q = search.trim();
    if (role !== "all") p.role = role;
    if (status !== "all") p.status = status;
    if (issue !== "all") p.issue = issue;
    return p;
  }, [search, role, status, issue]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, aud] = await Promise.all([
        api.get("/admin/compliance/overview", { params: filterParams }),
        api.get("/admin/compliance/audit", { params: auditEvent !== "all" ? { event_type: auditEvent, limit: "100" } : { limit: "100" } }),
      ]);
      setOverview(ov?.data || null);
      setAudit(Array.isArray(aud?.data?.logs) ? aud.data.logs : []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [filterParams, auditEvent]);

  useEffect(() => { load(); }, [load]);

  const stats = overview?.stats;
  const drivers = useMemo(() => {
    const rows = overview?.filtered_rows || [];
    return rows.filter((r) => r.role === "delivery");
  }, [overview]);
  const restaurants = useMemo(() => {
    const rows = overview?.filtered_rows || [];
    return rows.filter((r) => r.role === "vendor");
  }, [overview]);

  const exportCsv = async () => {
    setExporting("csv");
    try {
      const res = await api.get("/admin/compliance/export/csv", { params: filterParams });
      downloadBlob(res?.data?.csv || "", res?.data?.filename || "compliance.csv", "text/csv");
    } catch (e) {
      alert("CSV export failed");
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    setExporting("pdf");
    try {
      const res = await api.get("/admin/compliance/export/pdf", { params: filterParams });
      const b64 = res?.data?.pdf_base64;
      if (!b64) throw new Error("No PDF");
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      downloadBlob(bytes, res?.data?.filename || "compliance.pdf", "application/pdf");
    } catch (e) {
      alert("PDF export failed");
    } finally {
      setExporting(null);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      await api.post("/admin/notifications/scan", {});
      await load();
    } catch (e) {
      alert("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const statTiles = stats ? [
    ["Compliance %", `${stats.compliance_percentage}%`],
    ["Missing agreements", stats.missing_agreements],
    ["Expired licenses", stats.expired_licenses],
    ["Expired insurance", stats.expired_insurance],
    ["Pending approvals", stats.pending_approvals],
    ["Pending BG checks", stats.pending_background_checks],
    ["Drivers", `${stats.drivers_approved}/${stats.drivers_total}`],
    ["Restaurants", `${stats.restaurants_approved}/${stats.restaurants_total}`],
  ] : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {["overview", "approvals", "audit"].map((t) => (
            <button
              key={t}
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-bold capitalize"
              style={{
                background: tab === t ? "var(--primary)" : "var(--surface-2)",
                color: tab === t ? "#0A0A0A" : "var(--text)",
              }}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" className="btn-ghost text-sm" onClick={runScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Run scan"}
          </button>
          <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={exportCsv} disabled={exporting}>
            <Download size={14} /> {exporting === "csv" ? "Exporting…" : "CSV"}
          </button>
          <button type="button" className="btn-primary text-sm inline-flex items-center gap-2" onClick={exportPdf} disabled={exporting}>
            <FileText size={14} /> {exporting === "pdf" ? "Exporting…" : "PDF"}
          </button>
        </div>
      </div>

      {tab === "overview" && (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {statTiles.map(([label, val]) => (
                <div key={label} className="card p-4 text-center">
                  <div className="text-xl font-bold">{val}</div>
                  <div className="text-[10px] mt-1 uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="card p-4 grid md:grid-cols-5 gap-3">
            <div className="md:col-span-2 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
              <input
                className="input-field w-full pl-9"
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input-field" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="all">All roles</option>
              <option value="delivery">Drivers</option>
              <option value="vendor">Restaurants</option>
            </select>
            <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="issues">Has issues</option>
            </select>
            <select className="input-field" value={issue} onChange={(e) => setIssue(e.target.value)}>
              <option value="all">All issues</option>
              <option value="missing_agreements">Missing agreements</option>
              <option value="expired_license">Expired license</option>
              <option value="expired_insurance">Expired insurance</option>
              <option value="pending_bg">Pending BG check</option>
              <option value="payout">Payout incomplete</option>
              <option value="pending_approval">Pending approval</option>
            </select>
          </div>

          <div>
            <h2 className="font-display text-xl font-bold mb-4">Driver status ({drivers.length})</h2>
            <PartnerTable title="Drivers" rows={drivers} onReview={setDossierUser} />
          </div>

          <div>
            <h2 className="font-display text-xl font-bold mb-4">Restaurant status ({restaurants.length})</h2>
            <PartnerTable title="Restaurants" rows={restaurants} onReview={setDossierUser} />
          </div>
        </>
      )}

      {tab === "approvals" && (
        <div>
          <h2 className="font-display text-xl font-bold mb-4">Pending approvals</h2>
          <ApprovalsTab onChanged={load} onReview={setDossierUser} />
        </div>
      )}

      {tab === "audit" && (
        <div>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-xl font-bold">Audit history</h2>
            <select className="input-field !w-auto" value={auditEvent} onChange={(e) => setAuditEvent(e.target.value)}>
              <option value="all">All events</option>
              <option value="approval_changed">Approvals</option>
              <option value="agreement_accepted">Agreements</option>
              <option value="signup">Signups</option>
            </select>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <th className="text-left p-3">When</th>
                  <th className="text-left p-3">Event</th>
                  <th className="text-left p-3">User</th>
                  <th className="text-left p-3">Actor</th>
                  <th className="text-left p-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((log) => (
                  <tr key={log.log_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-3 text-xs whitespace-nowrap">{log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</td>
                    <td className="p-3 font-mono text-xs">{log.event_type}</td>
                    <td className="p-3">{log.user?.name || log.user_id || "—"}</td>
                    <td className="p-3">{log.actor?.name || log.actor_id || "—"}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>{log.message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {audit.length === 0 && (
              <p className="p-6 text-center text-sm" style={{ color: "var(--muted)" }}>No audit entries found.</p>
            )}
          </div>
        </div>
      )}

      {dossierUser && (
        <ComplianceDossier userId={dossierUser} onClose={() => setDossierUser(null)} onAction={load} />
      )}
    </div>
  );
}
