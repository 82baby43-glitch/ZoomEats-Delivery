"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import ApprovalsTab from "@/components/admin/ApprovalsTab";
import ComplianceDossier from "@/components/admin/ComplianceDossier";

export default function AdminComplianceDashboard() {
  const [stats, setStats] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [dossierUser, setDossierUser] = useState(null);
  const [filter, setFilter] = useState("all");
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dash, sigs] = await Promise.all([
        api.get("/admin/compliance/dashboard"),
        api.get("/admin/compliance/agreements", { params: filter !== "all" ? { role: filter } : {} }),
      ]);
      setStats(dash?.data?.stats);
      setSignatures(Array.isArray(sigs?.data) ? sigs.data : []);
    } catch (e) {
      console.warn(e);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await api.post("/admin/notifications/scan", {});
      alert(`Notification scan complete: ${JSON.stringify(res?.data || {})}`);
    } catch (e) {
      alert("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button type="button" className="btn-ghost text-sm" onClick={runScan} disabled={scanning}>
          {scanning ? "Scanning…" : "Run notification scan"}
        </button>
      </div>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            ["Pending", stats.pending_approvals],
            ["Missing agreements", stats.missing_agreements],
            ["Pending BG", stats.pending_background_checks],
            ["Expired docs", stats.expired_documents],
            ["Signatures", stats.total_signatures],
            ["Compliance %", `${stats.compliance_percentage}%`],
          ].map(([label, val]) => (
            <div key={label} className="card p-4 text-center">
              <div className="text-2xl font-bold">{val}</div>
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="font-display text-xl font-bold mb-4">Pending Approvals</h2>
        <ApprovalsTab onChanged={load} onReview={setDossierUser} />
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="font-display text-xl font-bold">Agreement Signatures</h2>
          <select className="input-field !w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All roles</option>
            <option value="delivery">Drivers</option>
            <option value="vendor">Restaurants</option>
            <option value="customer">Customers</option>
          </select>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--surface-2)" }}>
              <tr>
                <th className="text-left p-3">User</th>
                <th className="text-left p-3">Agreement</th>
                <th className="text-left p-3">Version</th>
                <th className="text-left p-3">Signature</th>
                <th className="text-left p-3">Signed</th>
                <th className="text-left p-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {signatures.slice(0, 100).map((s) => (
                <tr key={s.acceptance_id} className="border-t cursor-pointer hover:opacity-80" style={{ borderColor: "var(--border)" }} onClick={() => setDossierUser(s.user_id)}>
                  <td className="p-3">{s.user?.name || s.user_id}<br /><span className="text-xs" style={{ color: "var(--muted)" }}>{s.user?.email}</span></td>
                  <td className="p-3">{s.agreement_type?.replace(/_/g, " ")}</td>
                  <td className="p-3">{s.agreement_version}</td>
                  <td className="p-3 font-mono text-xs">{s.signature || s.typed_name}</td>
                  <td className="p-3 text-xs">{new Date(s.accepted_at).toLocaleString()}</td>
                  <td className="p-3 text-xs">{s.ip_address || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {signatures.length === 0 && (
            <p className="p-6 text-center text-sm" style={{ color: "var(--muted)" }}>No signatures yet.</p>
          )}
        </div>
      </div>

      {dossierUser && (
        <ComplianceDossier userId={dossierUser} onClose={() => setDossierUser(null)} onAction={load} />
      )}
    </div>
  );
}
