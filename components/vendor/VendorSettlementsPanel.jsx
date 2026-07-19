"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DollarSign, FileText, TrendingDown } from "lucide-react";
import { logClientError } from "@/lib/clientErrorLog";

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function VendorSettlementsPanel() {
  const [report, setReport] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, weeklyRes] = await Promise.all([
        api.get("/vendor/settlements"),
        api.get("/vendor/settlements/weekly"),
      ]);
      setReport(reportRes?.data || null);
      setWeekly(weeklyRes?.data || null);
    } catch (e) {
      logClientError("vendor.settlements.load", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="mt-6" style={{ color: "var(--muted)" }}>Loading settlements…</p>;
  }

  const commission = report?.commission;
  const lines = report?.lines || [];
  const totals = report?.totals || {};

  return (
    <div className="mt-6 space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-sm flex items-center gap-1" style={{ color: "var(--muted)" }}>
            <DollarSign size={14} /> Commission rate
          </div>
          <div className="font-display text-2xl font-bold">
            {commission?.commission_percent != null ? `${Number(commission.commission_percent).toFixed(1)}%` : "—"}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            {commission?.plan_name || commission?.source || "platform default"}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm" style={{ color: "var(--muted)" }}>This week gross</div>
          <div className="font-display text-2xl font-bold">{money(weekly?.gross_sales)}</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            {weekly?.period_start} → {weekly?.period_end}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm flex items-center gap-1" style={{ color: "var(--muted)" }}>
            <TrendingDown size={14} /> Weekly commission
          </div>
          <div className="font-display text-2xl font-bold">{money(weekly?.commission_total)}</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Avg {Number(weekly?.average_commission_rate || 0).toFixed(1)}%
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm" style={{ color: "var(--muted)" }}>Weekly net payout</div>
          <div className="font-display text-2xl font-bold">{money(weekly?.net_payout_total)}</div>
          <div className="text-xs mt-1 capitalize" style={{ color: "var(--muted)" }}>
            {weekly?.order_count || 0} orders · {weekly?.status || "open"}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-display text-lg font-bold flex items-center gap-2 mb-4">
          <FileText size={18} /> Settlement report
        </h3>
        <div className="flex flex-wrap gap-4 mb-4 text-sm">
          <span>Gross: <strong>{money(totals.gross_sales)}</strong></span>
          <span>Commission: <strong>{money(totals.commission_total)}</strong></span>
          <span>Net payout: <strong>{money(totals.net_payout_total)}</strong></span>
          <span>{totals.order_count || 0} orders</span>
        </div>
        {lines.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No settlement lines yet. Orders will appear here after delivery.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4 text-right">Gross</th>
                  <th className="py-2 pr-4 text-right">Commission</th>
                  <th className="py-2 pr-4 text-right">Net</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.order_id} className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 pr-4">{fmtDate(line.created_at)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">…{String(line.order_id).slice(-8)}</td>
                    <td className="py-2 pr-4 text-right">{money(line.gross_sales)}</td>
                    <td className="py-2 pr-4 text-right">
                      {money(line.commission_amount)}
                      {line.commission_percent != null && (
                        <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>
                          ({line.commission_percent}%)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-bold">{money(line.net_payout)}</td>
                    <td className="py-2 capitalize">{line.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
