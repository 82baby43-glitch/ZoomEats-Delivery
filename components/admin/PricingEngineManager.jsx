"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { Calculator, DollarSign, Save, ToggleLeft, ToggleRight, Play, Shield } from "lucide-react";
import { logClientError } from "@/lib/clientErrorLog";

const RULE_LABELS = {
  driver_base_pay: "Base Driver Pay ($)",
  mileage_rate: "Per-Mile Rate ($)",
  time_rate: "Per-Minute Rate ($)",
  wait_rate: "Wait Time Rate ($/min)",
  delivery_fee: "Base Delivery Fee ($)",
  service_fee: "Service Fee",
  commission_rate: "Commission Rate (%)",
  small_order_fee: "Small Order Fee ($)",
  small_order_threshold: "Small Order Threshold ($)",
  distance_fee: "Distance Fee ($/mile)",
  surge_limit: "Surge Cap ($)",
  tax_rate: "Tax Rate (%)",
  min_platform_profit: "Min Platform Profit ($)",
  subsidy_enabled: "Subsidy Mode (1=on)",
  promotion_budget: "Promotion Budget ($)",
  pricing_version: "Pricing Version",
  guaranteed_pay: "Driver Guaranteed Pay ($)",
  long_distance_bonus: "Long-Distance Bonus ($)",
  long_distance_threshold: "Long-Distance Threshold (miles)",
  peak_bonus: "Peak Hour Bonus ($)",
};

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export default function PricingEngineManager() {
  const [rules, setRules] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [edits, setEdits] = useState({});
  const [sim, setSim] = useState({ subtotal: "25.00", tip_amount: "3.00", promo_code: "" });
  const [simResult, setSimResult] = useState(null);
  const [testMode, setTestMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, summaryRes] = await Promise.all([
        api.get("/admin/pricing/rules"),
        api.get("/admin/pricing/summary"),
      ]);
      setRules(Array.isArray(rulesRes?.data) ? rulesRes.data : []);
      setSummary(summaryRes?.data || null);
    } catch (e) {
      logClientError("admin.pricing.load", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeRules = rules.filter((r) => r.active);
  const grouped = activeRules.reduce((acc, r) => {
    if (!acc[r.rule_type]) acc[r.rule_type] = r;
    return acc;
  }, {});

  const updateEdit = (ruleType, field, value) => {
    setEdits((prev) => ({
      ...prev,
      [ruleType]: { ...(prev[ruleType] || grouped[ruleType] || {}), [field]: value },
    }));
  };

  const saveRule = async (ruleType) => {
    const base = grouped[ruleType];
    const patch = edits[ruleType] || base;
    if (!patch) return;
    setBusy(ruleType);
    try {
      await api.post("/admin/pricing/rules", {
        rule_name: patch.rule_name || RULE_LABELS[ruleType] || ruleType,
        rule_type: ruleType,
        value: patch.value != null ? Number(patch.value) : 0,
        percentage: patch.percentage != null ? Number(patch.percentage) : null,
        minimum_amount: patch.minimum_amount != null ? Number(patch.minimum_amount) : null,
        maximum_amount: patch.maximum_amount != null ? Number(patch.maximum_amount) : null,
        active: true,
      });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[ruleType];
        return next;
      });
      await load();
    } catch (e) {
      alert(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const toggleSubsidy = async () => {
    const current = Number(grouped.subsidy_enabled?.value ?? 0);
    setBusy("subsidy");
    try {
      await api.post("/admin/pricing/rules", {
        rule_name: "Subsidy Mode Enabled",
        rule_type: "subsidy_enabled",
        value: current > 0 ? 0 : 1,
        active: true,
      });
      await load();
    } catch (e) {
      alert(e?.message || "Toggle failed");
    } finally {
      setBusy(null);
    }
  };

  const runSimulator = async () => {
    setBusy("simulate");
    try {
      const res = await api.post("/admin/pricing/simulate", {
        subtotal: Number(sim.subtotal),
        tip_amount: Number(sim.tip_amount),
        promo_code: sim.promo_code || null,
        allow_subsidy: testMode,
      });
      setSimResult(res?.data || null);
    } catch (e) {
      alert(e?.message || "Simulation failed");
    } finally {
      setBusy(null);
    }
  };

  const renderRuleRow = (ruleType) => {
    const base = grouped[ruleType];
    if (!base && !RULE_LABELS[ruleType]) return null;
    const row = edits[ruleType] || base || {};
    const hasPct = ["service_fee", "commission_rate", "tax_rate", "stripe_fee_percent"].includes(ruleType);
    const hasMinMax = ["delivery_fee", "service_fee"].includes(ruleType);

    return (
      <div key={ruleType} className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-bold">{RULE_LABELS[ruleType] || ruleType}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>{ruleType}</div>
          </div>
          <button
            className="btn-primary text-sm inline-flex items-center gap-1"
            disabled={busy === ruleType}
            onClick={() => saveRule(ruleType)}
          >
            <Save size={14} /> Save
          </button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {hasPct ? (
            <label className="text-sm">
              <span className="label-eyebrow">Percentage</span>
              <input
                className="input-field mt-1"
                type="number"
                step="0.01"
                value={row.percentage ?? ""}
                onChange={(e) => updateEdit(ruleType, "percentage", e.target.value)}
              />
            </label>
          ) : (
            <label className="text-sm">
              <span className="label-eyebrow">Value</span>
              <input
                className="input-field mt-1"
                type="number"
                step="0.01"
                value={row.value ?? ""}
                onChange={(e) => updateEdit(ruleType, "value", e.target.value)}
              />
            </label>
          )}
          {hasMinMax && (
            <>
              <label className="text-sm">
                <span className="label-eyebrow">Minimum</span>
                <input
                  className="input-field mt-1"
                  type="number"
                  step="0.01"
                  value={row.minimum_amount ?? ""}
                  onChange={(e) => updateEdit(ruleType, "minimum_amount", e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="label-eyebrow">Maximum</span>
                <input
                  className="input-field mt-1"
                  type="number"
                  step="0.01"
                  value={row.maximum_amount ?? ""}
                  onChange={(e) => updateEdit(ruleType, "maximum_amount", e.target.value)}
                />
              </label>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl font-black tracking-tighter flex items-center gap-3">
              <Calculator size={32} /> Pricing Engine
            </h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Central intelligent pricing & payout configuration
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">← Admin</Link>
          <Link href="/admin/pricing-rules" className="btn-secondary text-sm">Pricing Rules</Link>
        </div>

        {summary && (
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div className="card p-4">
              <div className="text-sm" style={{ color: "var(--muted)" }}>Snapshots recorded</div>
              <div className="font-display text-2xl font-bold">{summary.snapshot_count}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm" style={{ color: "var(--muted)" }}>Avg order total</div>
              <div className="font-display text-2xl font-bold">{money(summary.average_order_total)}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm" style={{ color: "var(--muted)" }}>Avg platform profit</div>
              <div className="font-display text-2xl font-bold">{money(summary.average_profit)}</div>
            </div>
            {summary.profit_protection && (
              <>
                <div className="card p-4">
                  <div className="text-sm flex items-center gap-1" style={{ color: "var(--muted)" }}>
                    <Shield size={14} /> Fee adjusted
                  </div>
                  <div className="font-display text-2xl font-bold">{summary.profit_protection.adjusted ?? 0}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Last {summary.profit_protection.period_days}d</div>
                </div>
                <div className="card p-4">
                  <div className="text-sm" style={{ color: "var(--muted)" }}>Subsidized</div>
                  <div className="font-display text-2xl font-bold">{summary.profit_protection.subsidized ?? 0}</div>
                </div>
                <div className="card p-4">
                  <div className="text-sm" style={{ color: "var(--muted)" }}>Blocked</div>
                  <div className="font-display text-2xl font-bold" style={{ color: (summary.profit_protection.blocked ?? 0) > 0 ? "var(--primary)" : undefined }}>
                    {summary.profit_protection.blocked ?? 0}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2 text-sm"
            onClick={toggleSubsidy}
            disabled={busy === "subsidy"}
          >
            {Number(grouped.subsidy_enabled?.value ?? 0) > 0 ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            Subsidy mode {Number(grouped.subsidy_enabled?.value ?? 0) > 0 ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2 text-sm"
            onClick={() => setTestMode((v) => !v)}
          >
            <DollarSign size={16} /> Test mode {testMode ? "ON" : "OFF"}
          </button>
        </div>

        {loading ? (
          <p>Loading pricing rules…</p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4 mb-10">
            {Object.keys(RULE_LABELS).map(renderRuleRow)}
          </div>
        )}

        <div className="card p-6 space-y-4 mb-10">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Play size={20} /> Payout Simulator
          </h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="label-eyebrow">Subtotal ($)</span>
              <input className="input-field mt-1" value={sim.subtotal} onChange={(e) => setSim({ ...sim, subtotal: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="label-eyebrow">Tip ($)</span>
              <input className="input-field mt-1" value={sim.tip_amount} onChange={(e) => setSim({ ...sim, tip_amount: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="label-eyebrow">Promo code</span>
              <input className="input-field mt-1" value={sim.promo_code} onChange={(e) => setSim({ ...sim, promo_code: e.target.value })} />
            </label>
          </div>
          <button className="btn-primary" onClick={runSimulator} disabled={busy === "simulate"}>
            {busy === "simulate" ? "Calculating…" : "Run simulation"}
          </button>

          {simResult && (
            <div className="grid md:grid-cols-2 gap-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="space-y-1 text-sm">
                <div className="font-bold mb-2">Customer</div>
                <div className="flex justify-between"><span>Subtotal</span><span>{money(simResult.customer?.subtotal)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>{money(simResult.customer?.tax_amount)}</span></div>
                <div className="flex justify-between"><span>Delivery</span><span>{money(simResult.customer?.delivery_fee)}</span></div>
                <div className="flex justify-between"><span>Service fee</span><span>{money(simResult.customer?.service_fee)}</span></div>
                <div className="flex justify-between"><span>Small order fee</span><span>{money(simResult.customer?.small_order_fee)}</span></div>
                <div className="flex justify-between"><span>Discount</span><span>-{money(simResult.customer?.discount_amount)}</span></div>
                <div className="flex justify-between"><span>Tip</span><span>{money(simResult.customer?.tip_amount)}</span></div>
                <div className="flex justify-between font-bold pt-2"><span>Total</span><span>{money(simResult.customer?.customer_total)}</span></div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="font-bold mb-2">Payouts</div>
                <div className="flex justify-between"><span>Driver pay</span><span>{money(simResult.driver?.final_driver_pay)}</span></div>
                <div className="flex justify-between"><span>Restaurant payout</span><span>{money(simResult.restaurant?.net_payout)}</span></div>
                <div className="flex justify-between"><span>Commission</span><span>{money(simResult.restaurant?.commission_amount)}</span></div>
                <div className="flex justify-between"><span>Stripe fees</span><span>{money(simResult.platform?.stripe_cost)}</span></div>
                <div className="flex justify-between font-bold pt-2" style={{ color: simResult.platform?.net_profit >= 0 ? "var(--text)" : "var(--primary)" }}>
                  <span>Platform profit</span><span>{money(simResult.platform?.net_profit)}</span>
                </div>
                <div className="text-xs pt-2" style={{ color: "var(--muted)" }}>
                  {simResult.distance_miles} mi · surge {simResult.surge_multiplier}x · {simResult.version}
                  {simResult.blocked && " · BLOCKED"}
                  {simResult.profit_protected && " · profit-adjusted"}
                </div>
              </div>
            </div>
          )}
        </div>

        {summary?.profit_protection?.recent?.length > 0 && (
          <div className="card p-6 space-y-4">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <Shield size={20} /> Profit Protection Log
            </h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Auditable trail when quotes are adjusted, subsidized, or blocked to protect platform margin.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4 text-right">Profit before</th>
                    <th className="py-2 pr-4 text-right">Profit after</th>
                    <th className="py-2 pr-4 text-right">Delivery fee</th>
                    <th className="py-2">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.profit_protection.recent.map((row) => (
                    <tr key={row.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 pr-4">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4 capitalize">{row.action}</td>
                      <td className="py-2 pr-4 text-right">{money(row.profit_before)}</td>
                      <td className="py-2 pr-4 text-right">{money(row.profit_after)}</td>
                      <td className="py-2 pr-4 text-right">
                        {money(row.delivery_fee_before)} → {money(row.delivery_fee_after)}
                      </td>
                      <td className="py-2 font-mono text-xs">{row.order_id ? `…${String(row.order_id).slice(-8)}` : "pre-order"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
