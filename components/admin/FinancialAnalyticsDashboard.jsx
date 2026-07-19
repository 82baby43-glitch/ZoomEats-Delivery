"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  DollarSign,
  Gift,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Store,
  TrendingUp,
  Truck,
} from "lucide-react";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { formatMoney } from "@/lib/safeData";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { logClientError } from "@/lib/clientErrorLog";

function money(n) {
  return `$${formatMoney(n)}`;
}

function MetricCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</p>
          <p className="font-display text-2xl font-bold mt-1">{value}</p>
          {sub ? <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{sub}</p> : null}
        </div>
        <div className="p-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
          <Icon size={20} style={{ color: "var(--primary)" }} />
        </div>
      </div>
    </div>
  );
}

function TrendChart({ title, points, valueKey = "amount", format = money }) {
  if (!points?.length) {
    return (
      <div className="card p-5">
        <h3 className="font-display text-lg font-bold mb-2">{title}</h3>
        <p className="text-sm" style={{ color: "var(--muted)" }}>No data for this period.</p>
      </div>
    );
  }

  const max = Math.max(...points.map((p) => Number(p[valueKey] ?? 0)), 1);

  return (
    <div className="card p-5">
      <h3 className="font-display text-lg font-bold mb-4">{title}</h3>
      <div className="space-y-2">
        {points.slice(-14).map((p) => {
          const val = Number(p[valueKey] ?? 0);
          const pct = Math.max(4, (val / max) * 100);
          return (
            <div key={p.date} className="grid grid-cols-[72px_1fr_80px] gap-2 items-center text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>{p.date.slice(5)}</span>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--primary)" }} />
              </div>
              <span className="text-right font-mono text-xs">{format(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FinancialAnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/financial/analytics", { params: { days: String(days) } });
      setData(r?.data || null);
      setError(false);
    } catch (e) {
      logClientError("admin.financialAnalytics", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary;

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl font-black tracking-tighter flex items-center gap-3">
              <BarChart3 size={32} /> Financial Analytics
            </h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Platform economics, payout averages, and fee trends
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input-field text-sm"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              data-testid="analytics-period"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button type="button" className="btn-secondary text-sm inline-flex items-center gap-2" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <Link href="/admin/revenue" className="btn-ghost text-sm">Revenue Center</Link>
            <Link href="/admin" className="btn-ghost text-sm">← Admin</Link>
          </div>
        </div>

        {loading && !data ? (
          <LoadingSkeleton label="Loading financial analytics…" rows={6} />
        ) : error || !summary ? (
          <ErrorState title="Could not load analytics" onRetry={load} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
              <MetricCard icon={DollarSign} label="Revenue" value={money(summary.revenue)} sub={`${summary.order_count} orders`} />
              <MetricCard icon={ShoppingBag} label="GMV" value={money(summary.gmv)} sub="Gross merchandise value" />
              <MetricCard icon={TrendingUp} label="Platform profit" value={money(summary.platform_profit)} sub="Net after costs" />
              <MetricCard icon={Truck} label="Avg driver payout" value={money(summary.avg_driver_payout)} sub="Per delivery" />
              <MetricCard icon={Store} label="Avg restaurant payout" value={money(summary.avg_restaurant_payout)} sub="Per settlement" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <MetricCard
                icon={DollarSign}
                label="Commission revenue"
                value={money(summary.commission_revenue)}
                sub="Restaurant commissions"
              />
              <MetricCard
                icon={Truck}
                label="Avg delivery fee"
                value={money(summary.delivery_fee_average)}
                sub="Per order (all fees)"
              />
              <MetricCard icon={RotateCcw} label="Refunds" value={money(summary.refunds)} sub="Platform + settlement" />
              <MetricCard icon={Gift} label="Promotion costs" value={money(summary.promotion_costs)} sub="Discounts & promos" />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <TrendChart title="Delivery fee trends (daily avg)" points={data.trends.delivery_fees} valueKey="average" />
              <TrendChart title="Revenue trend" points={data.trends.revenue} />
              <TrendChart title="GMV trend" points={data.trends.gmv} />
              <TrendChart title="Platform profit trend" points={data.trends.platform_profit} />
              <TrendChart title="Commission revenue trend" points={data.trends.commission_revenue} />
              <TrendChart title="Promotion costs trend" points={data.trends.promotion_costs} />
              <TrendChart title="Refunds trend" points={data.trends.refunds} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
