"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, DollarSign, Truck, Store, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/safeData";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { logClientError } from "@/lib/clientErrorLog";

function MetricCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</p>
          <p className="font-display text-2xl font-bold mt-1">{value}</p>
          {sub ? <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{sub}</p> : null}
        </div>
        <div className="p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
          <Icon size={20} style={{ color: "var(--accent)" }} />
        </div>
      </div>
    </div>
  );
}

export default function RevenueCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/revenue");
      setData(r?.data && typeof r.data === "object" ? r.data : null);
      setError(false);
    } catch (e) {
      logClientError("admin.revenue", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <LoadingSkeleton label="Loading revenue center…" rows={4} />;
  }

  if (error || !data) {
    return <ErrorState title="Could not load revenue data" onRetry={load} />;
  }

  const counts = data.ledger_counts || {};

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign} label="Total Revenue" value={formatMoney(data.total_revenue)} sub={`${counts.paid_orders || 0} paid orders`} />
        <MetricCard icon={Truck} label="Driver Earnings" value={formatMoney(data.driver_earnings)} sub={`Avg ${formatMoney(data.average_driver_pay)} / delivery`} />
        <MetricCard icon={Store} label="Restaurant Payments" value={formatMoney(data.restaurant_payments)} sub={`${counts.restaurant_settlements || 0} settlements`} />
        <MetricCard icon={TrendingUp} label="Platform Commission" value={formatMoney(data.platform_commission)} sub={`Net profit ${formatMoney(data.platform_net_profit)}`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Average Order Value</p>
          <p className="font-display text-xl font-bold mt-2">{formatMoney(data.average_order_value)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Average Driver Pay</p>
          <p className="font-display text-xl font-bold mt-2">{formatMoney(data.average_driver_pay)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Average Margin</p>
          <p className="font-display text-xl font-bold mt-2">{data.average_margin_pct}%</p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-display text-lg font-bold mb-4">Ledger Activity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p style={{ color: "var(--muted)" }}>Driver earnings records</p>
            <p className="font-bold text-lg">{counts.driver_earnings || 0}</p>
          </div>
          <div>
            <p style={{ color: "var(--muted)" }}>Restaurant settlements</p>
            <p className="font-bold text-lg">{counts.restaurant_settlements || 0}</p>
          </div>
          <div>
            <p style={{ color: "var(--muted)" }}>Platform revenue records</p>
            <p className="font-bold text-lg">{counts.platform_revenue || 0}</p>
          </div>
        </div>
        <p className="text-xs mt-4" style={{ color: "var(--muted)" }}>
          Financial records are written automatically when orders are marked delivered and paid.
        </p>
      </div>
    </div>
  );
}
