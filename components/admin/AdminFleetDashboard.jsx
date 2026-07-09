"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DELIVERY_MODE_UI, MODE_MAP_ICONS } from "@/lib/deliveryModes/constants";

export default function AdminFleetDashboard() {
  const [drivers, setDrivers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [d, a] = await Promise.all([
        api.get("/admin/fleet/drivers"),
        api.get("/admin/fleet/analytics"),
      ]);
      setDrivers(d?.data?.drivers || d?.drivers || []);
      setAnalytics(a?.data || a);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const approveMode = async (userId, modeKey) => {
    try {
      await api.post("/admin/fleet/approve-mode", { user_id: userId, mode_key: modeKey, status: "approved" });
      await load();
    } catch (e) {
      alert(e?.message || "Failed");
    }
  };

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading fleet data…</p>;

  return (
    <div className="space-y-8">
      <div>
        <div className="label-eyebrow">Fleet Operations</div>
        <h1 className="font-display text-3xl font-bold mt-1">Delivery Mode Analytics</h1>
      </div>

      {analytics && (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(analytics.mode_popularity || []).map((m) => (
            <div key={m.mode_key} className="card p-4">
              <div className="text-2xl">{MODE_MAP_ICONS[m.mode_key]}</div>
              <div className="font-bold mt-2">{DELIVERY_MODE_UI[m.mode_key]?.label || m.mode_key}</div>
              <div className="text-sm" style={{ color: "var(--muted)" }}>{m.count} drivers · {m.pct}%</div>
            </div>
          ))}
        </div>
      )}

      {analytics?.avg_delivery_time_by_mode?.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold mb-3">Performance by Mode</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--muted)" }}>
                  <th className="text-left py-2">Mode</th>
                  <th className="text-right py-2">Avg Delivery</th>
                  <th className="text-right py-2">Avg Earnings</th>
                  <th className="text-right py-2">Completion</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.avg_delivery_time_by_mode || []).map((row) => {
                  const earn = (analytics.avg_earnings_by_mode || []).find((e) => e.mode_key === row.mode_key);
                  const eff = (analytics.dispatch_efficiency_by_mode || []).find((e) => e.mode_key === row.mode_key);
                  return (
                    <tr key={row.mode_key} className="border-t border-white/5">
                      <td className="py-2">{MODE_MAP_ICONS[row.mode_key]} {DELIVERY_MODE_UI[row.mode_key]?.label}</td>
                      <td className="text-right">{row.avg_min} min</td>
                      <td className="text-right">${earn?.avg?.toFixed(2) || "—"}</td>
                      <td className="text-right">{eff ? `${Math.round(eff.completion_rate * 100)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-bold mb-4">Driver Fleet ({drivers.length})</h2>
        <div className="space-y-3 max-h-[480px] overflow-y-auto">
          {drivers.map((d) => {
            const mode = d.active_delivery_mode || "car";
            const fleet = d.fleet || {};
            const pending = (fleet.approved_modes || []).filter((m) => m.approval_status === "pending");
            return (
              <div key={d.driver_id} className="p-3 rounded-lg flex flex-wrap items-center justify-between gap-3" style={{ background: "var(--surface-2)" }}>
                <div>
                  <div className="font-medium">{d.users?.name || d.user_id}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{d.users?.email}</div>
                  <div className="text-sm mt-1">
                    Active: {MODE_MAP_ICONS[mode]} {DELIVERY_MODE_UI[mode]?.label || mode}
                    {d.availability && <span className="text-green-400 ml-2">· Online</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pending.map((m) => (
                    <button
                      key={m.mode_key}
                      type="button"
                      className="btn-primary !py-1 text-xs"
                      onClick={() => approveMode(d.user_id, m.mode_key)}
                    >
                      Approve {DELIVERY_MODE_UI[m.mode_key]?.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
