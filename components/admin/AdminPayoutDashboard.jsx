"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";

export default function AdminPayoutDashboard() {
  const [data, setData] = useState({ stats: null, accounts: [] });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/connect/dashboard");
      setData({
        stats: res?.data?.stats || null,
        accounts: Array.isArray(res?.data?.accounts) ? res.data.accounts : [],
      });
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = data.accounts.filter((row) => {
    if (filter === "missing") return !row.payout_ready;
    if (filter === "reverify") return row.requires_reverification;
    if (filter === "identity") return !row.identity_verified;
    return true;
  });

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-eyebrow">Admin</div>
            <h1 className="font-display text-4xl font-black tracking-tighter">Payout dashboard</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Stripe Connect status, identity verification, and missing payout alerts.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/compliance" className="btn-ghost text-sm">Compliance Center</Link>
            <Link href="/admin/tax" className="btn-ghost text-sm">Tax reporting</Link>
            <Link href="/admin" className="btn-ghost text-sm">Admin home</Link>
            <button type="button" className="btn-primary text-sm" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {data.stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              ["Accounts", data.stats.total],
              ["Payout ready", data.stats.payout_ready],
              ["Missing payout", data.stats.missing_payout],
              ["Reverification", data.stats.requires_reverification],
              ["Identity pending", data.stats.identity_pending],
            ].map(([label, val]) => (
              <div key={label} className="card p-4 text-center">
                <div className="text-2xl font-bold">{val}</div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {[
            ["all", "All"],
            ["missing", "Missing payout"],
            ["reverify", "Reverification"],
            ["identity", "Identity pending"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-bold"
              style={{
                background: filter === id ? "var(--primary)" : "var(--surface-2)",
                color: filter === id ? "white" : "var(--text)",
              }}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--surface-2)" }}>
              <tr>
                <th className="text-left p-3">Partner</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Stripe account</th>
                <th className="text-left p-3">Payouts</th>
                <th className="text-left p-3">Identity</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Synced</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                    {loading ? "Loading accounts…" : "No Connect accounts match this filter."}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.account_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">
                    <div className="font-bold">{row.user?.name || row.user_id}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{row.user?.email}</div>
                  </td>
                  <td className="p-3 capitalize">{row.entity_type}</td>
                  <td className="p-3 font-mono text-xs">{row.stripe_account_id}</td>
                  <td className="p-3">{row.payouts_enabled ? "Enabled" : "Disabled"}</td>
                  <td className="p-3">{row.identity_verified ? "Verified" : "Pending"}</td>
                  <td className="p-3">
                    {row.requires_reverification ? (
                      <span className="badge" style={{ color: "#eab308" }}>Reverify</span>
                    ) : row.payout_ready ? (
                      <span className="badge" style={{ color: "#22c55e" }}>Ready</span>
                    ) : (
                      <span className="badge">Incomplete</span>
                    )}
                  </td>
                  <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                    {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
