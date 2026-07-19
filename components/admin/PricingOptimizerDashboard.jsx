"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import {
  Brain,
  Clock,
  Gift,
  RefreshCw,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  Zap,
} from "lucide-react";
import { formatMoney } from "@/lib/safeData";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { logClientError } from "@/lib/clientErrorLog";

const CATEGORY_META = {
  delivery_fees: { label: "Delivery fees", icon: Truck, color: "var(--primary)" },
  driver_incentives: { label: "Driver incentives", icon: Zap, color: "var(--accent)" },
  surge_windows: { label: "Surge windows", icon: Clock, color: "var(--primary)" },
  promotion_timing: { label: "Promotion timing", icon: Gift, color: "var(--accent)" },
  profit_optimization: { label: "Profit optimization", icon: TrendingUp, color: "var(--primary)" },
  restaurant_insights: { label: "Restaurant insights", icon: Store, color: "var(--muted)" },
};

function ImpactBadge({ impact }) {
  const colors = {
    high: "var(--primary)",
    medium: "var(--accent)",
    low: "var(--muted)",
  };
  return (
    <span className="text-xs font-bold uppercase px-2 py-0.5 rounded" style={{ background: "var(--surface-2)", color: colors[impact] || "var(--muted)" }}>
      {impact}
    </span>
  );
}

export default function PricingOptimizerDashboard() {
  const [report, setReport] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [applying, setApplying] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/pricing/optimizer", { params: { days: String(days) } });
      setReport(r?.data || null);
      setError(false);
    } catch (e) {
      logClientError("admin.pricingOptimizer", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const applyRecommendation = async (rec) => {
    if (!rec.rule_type || !rec.actionable) return;
    const raw = String(rec.recommended_value ?? "");
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(num)) {
      alert("This recommendation cannot be auto-applied. Adjust manually in Pricing Rules.");
      return;
    }
    setApplying(rec.id);
    try {
      await api.post("/admin/pricing/optimizer/apply", {
        recommendation_id: rec.id,
        rule_type: rec.rule_type,
        rule_name: rec.title,
        value: num,
      });
      await load();
    } catch (e) {
      alert(e?.message || "Apply failed");
    } finally {
      setApplying(null);
    }
  };

  const grouped = (report?.recommendations || []).reduce((acc, rec) => {
    if (!acc[rec.category]) acc[rec.category] = [];
    acc[rec.category].push(rec);
    return acc;
  }, {});

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl font-black tracking-tighter flex items-center gap-3">
              <Brain size={32} /> AI Pricing Optimizer
            </h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Data-driven recommendations from historical orders, payouts, and margins
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input-field text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button type="button" className="btn-secondary text-sm inline-flex items-center gap-2" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <Link href="/admin/pricing" className="btn-ghost text-sm">Pricing Engine</Link>
            <Link href="/admin" className="btn-ghost text-sm">← Admin</Link>
          </div>
        </div>

        {loading && !report ? (
          <LoadingSkeleton label="Analyzing historical pricing data…" rows={6} />
        ) : error || !report ? (
          <ErrorState title="Could not generate recommendations" onRetry={load} />
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <div className="card p-4">
                <div className="text-xs" style={{ color: "var(--muted)" }}>Orders analyzed</div>
                <div className="font-display text-2xl font-bold">{report.summary.orders_analyzed}</div>
                <div className="text-xs mt-1 capitalize">{report.data_quality} data</div>
              </div>
              <div className="card p-4">
                <div className="text-xs" style={{ color: "var(--muted)" }}>Avg profit / order</div>
                <div className="font-display text-2xl font-bold">${formatMoney(report.summary.avg_profit_per_order)}</div>
              </div>
              <div className="card p-4">
                <div className="text-xs" style={{ color: "var(--muted)" }}>Profit margin</div>
                <div className="font-display text-2xl font-bold">{report.summary.profit_margin_pct}%</div>
              </div>
              <div className="card p-4">
                <div className="text-xs" style={{ color: "var(--muted)" }}>Avg delivery fee</div>
                <div className="font-display text-2xl font-bold">${formatMoney(report.summary.avg_delivery_fee)}</div>
              </div>
              <div className="card p-4">
                <div className="text-xs" style={{ color: "var(--muted)" }}>Promo spend / GMV</div>
                <div className="font-display text-2xl font-bold">{report.summary.promotion_spend_pct}%</div>
              </div>
            </div>

            {report.ai_summary && (
              <div className="card p-5 mb-8 border" style={{ borderColor: "var(--primary)" }}>
                <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
                  <Sparkles size={18} /> AI Summary
                </h2>
                <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{report.ai_summary}</div>
              </div>
            )}

            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const recs = grouped[key];
              if (!recs?.length) return null;
              const Icon = meta.icon;
              return (
                <section key={key} className="mb-8">
                  <h2 className="font-display text-xl font-bold flex items-center gap-2 mb-4">
                    <Icon size={20} style={{ color: meta.color }} /> {meta.label}
                  </h2>
                  <div className="space-y-3">
                    {recs.map((rec) => (
                      <div key={rec.id} className="card p-5" data-testid={`optimizer-rec-${rec.id}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold">{rec.title}</span>
                              <ImpactBadge impact={rec.impact} />
                              <span className="text-xs" style={{ color: "var(--muted)" }}>
                                {Math.round(rec.confidence * 100)}% confidence
                              </span>
                            </div>
                            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{rec.description}</p>
                            <p className="text-sm mt-2">{rec.rationale}</p>
                            {(rec.current_value != null || rec.recommended_value != null) && (
                              <p className="text-sm mt-2 font-mono">
                                {rec.current_value != null && <span>Current: {rec.current_value}</span>}
                                {rec.current_value != null && rec.recommended_value != null && " → "}
                                {rec.recommended_value != null && <span>Recommended: {rec.recommended_value}</span>}
                              </p>
                            )}
                          </div>
                          {rec.actionable && rec.rule_type && (
                            <button
                              type="button"
                              className="btn-primary text-sm shrink-0"
                              disabled={applying === rec.id}
                              onClick={() => applyRecommendation(rec)}
                            >
                              {applying === rec.id ? "Applying…" : "Apply"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {report.hourly_insights?.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display text-xl font-bold mb-4">Surge window heatmap (UTC)</h2>
                <div className="card p-5 overflow-x-auto">
                  <div className="grid grid-flow-col auto-cols-[minmax(64px,1fr)] gap-1 min-w-max">
                    {report.hourly_insights.map((h) => (
                      <div
                        key={h.hour}
                        className="text-center p-2 rounded text-xs"
                        style={{
                          background: h.surge_candidate ? "var(--primary)" : "var(--surface-2)",
                          color: h.surge_candidate ? "#0A0A0A" : "var(--muted)",
                        }}
                        title={`${h.order_count} orders, avg profit $${formatMoney(h.avg_profit)}`}
                      >
                        <div className="font-bold">{h.label}</div>
                        <div>{h.order_count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {report.restaurant_insights?.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-bold mb-4">Restaurant pricing insights</h2>
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                        <th className="p-3">Restaurant</th>
                        <th className="p-3 text-right">Orders</th>
                        <th className="p-3 text-right">GMV</th>
                        <th className="p-3 text-right">Commission</th>
                        <th className="p-3 text-right">Rate</th>
                        <th className="p-3">Insight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.restaurant_insights.map((r) => (
                        <tr key={r.restaurant_id} className="border-b" style={{ borderColor: "var(--border)" }}>
                          <td className="p-3 font-bold">{r.name}</td>
                          <td className="p-3 text-right">{r.order_count}</td>
                          <td className="p-3 text-right">${formatMoney(r.gross_sales)}</td>
                          <td className="p-3 text-right">${formatMoney(r.commission_total)}</td>
                          <td className="p-3 text-right">{r.avg_commission_rate}%</td>
                          <td className="p-3" style={{ color: "var(--muted)" }}>{r.insight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
