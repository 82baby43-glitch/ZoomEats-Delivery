"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/safeData";

const RULE_LABELS = {
  driver_base_pay: "Driver Base Pay",
  mileage_rate: "Mileage Rate",
  time_rate: "Time Rate",
  wait_rate: "Wait Compensation",
  delivery_fee: "Delivery Fee",
  service_fee: "Service Fee",
  commission_rate: "Commission %",
  small_order_fee: "Small Order Fee",
  small_order_threshold: "Small Order Threshold",
  distance_fee: "Distance Fee / mi",
  surge_limit: "Surge Cap",
  weather_fee: "Weather Fee",
  weather_multiplier: "Weather Multiplier",
  tax_rate: "Tax Rate %",
  stripe_fee_percent: "Stripe Fee %",
  stripe_fee_fixed: "Stripe Fee Fixed",
  peak_bonus: "Peak Bonus",
  large_order_bonus: "Large Order Bonus",
  large_order_threshold: "Large Order Threshold",
  guaranteed_pay: "Min Driver Guarantee",
};

export default function AdminPricingDashboard() {
  const [rules, setRules] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [recs, setRecs] = useState([]);
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [promoForm, setPromoForm] = useState({
    code: "",
    discount_type: "percent",
    discount_value: 10,
    usage_limit: "",
  });

  const refresh = useCallback(async () => {
    setErr("");
    try {
      const [r, a, rec, p] = await Promise.all([
        api.get("/admin/pricing/rules"),
        api.get("/admin/pricing/analytics"),
        api.get("/admin/pricing/recommendations"),
        api.get("/admin/pricing/promotions"),
      ]);
      setRules(Array.isArray(r?.data) ? r.data : []);
      setAnalytics(a?.data || null);
      setRecs(rec?.data?.recommendations || []);
      setPromos(Array.isArray(p?.data) ? p.data : []);
      const d = {};
      for (const rule of r?.data || []) {
        if (rule.active) {
          d[rule.id] = {
            value: rule.value,
            percentage: rule.percentage ?? "",
            minimum_amount: rule.minimum_amount ?? "",
            maximum_amount: rule.maximum_amount ?? "",
          };
        }
      }
      setDrafts(d);
    } catch (e) {
      setErr(getApiErrorMessage(e, "Failed to load pricing controls"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeRules = rules.filter((r) => r.active);

  const saveRule = async (rule) => {
    setSavingId(rule.id);
    setErr("");
    try {
      const draft = drafts[rule.id] || {};
      await api.patch(`/admin/pricing/rules/${rule.id}`, {
        value: Number(draft.value) || 0,
        percentage: draft.percentage === "" || draft.percentage == null ? null : Number(draft.percentage),
        minimum_amount:
          draft.minimum_amount === "" || draft.minimum_amount == null
            ? null
            : Number(draft.minimum_amount),
        maximum_amount:
          draft.maximum_amount === "" || draft.maximum_amount == null
            ? null
            : Number(draft.maximum_amount),
        reason: "admin_control_center",
      });
      await refresh();
    } catch (e) {
      setErr(getApiErrorMessage(e, "Could not save rule"));
    } finally {
      setSavingId(null);
    }
  };

  const createPromo = async () => {
    setErr("");
    try {
      await api.post("/admin/pricing/promotions", {
        code: promoForm.code,
        discount_type: promoForm.discount_type,
        discount_value: Number(promoForm.discount_value) || 0,
        usage_limit: promoForm.usage_limit === "" ? null : Number(promoForm.usage_limit),
      });
      setPromoForm({ code: "", discount_type: "percent", discount_value: 10, usage_limit: "" });
      await refresh();
    } catch (e) {
      setErr(getApiErrorMessage(e, "Could not create promotion"));
    }
  };

  if (loading) {
    return <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>Loading pricing engine…</div>;
  }

  const platform = analytics?.platform || {};
  const driver = analytics?.driver || {};
  const restaurant = analytics?.restaurant || {};

  return (
    <div className="space-y-10" data-testid="admin-pricing-dashboard">
      {err && (
        <div className="card p-4 text-sm" style={{ color: "var(--primary)" }} data-testid="pricing-error">
          {err}
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-4">
        {[
          { label: "Gross revenue", value: `$${formatMoney(platform.gross_revenue)}` },
          { label: "Net profit", value: `$${formatMoney(platform.net_profit)}` },
          { label: "Margin", value: `${formatMoney(platform.margin_pct)}%` },
          { label: "Avg driver pay", value: `$${formatMoney(driver.average_earnings)}` },
        ].map((m) => (
          <div key={m.label} className="card p-5">
            <div className="label-eyebrow">{m.label}</div>
            <div className="font-display text-2xl font-bold mt-2">{m.value}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="font-display text-2xl font-bold mb-2">Pricing control center</h2>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          Changes apply immediately — no code deploy required. All checkout, driver pay, and settlements use these rules.
        </p>
        <div className="space-y-3">
          {activeRules.map((rule) => {
            const draft = drafts[rule.id] || {};
            return (
              <div key={rule.id} className="card p-4 grid md:grid-cols-6 gap-3 items-end" data-testid={`rule-${rule.rule_type}`}>
                <div className="md:col-span-2">
                  <div className="font-bold">{RULE_LABELS[rule.rule_type] || rule.rule_name}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{rule.rule_type}</div>
                </div>
                <div>
                  <label className="label-eyebrow">Value</label>
                  <input
                    className="input-field mt-1"
                    type="number"
                    step="0.01"
                    value={draft.value ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [rule.id]: { ...draft, value: e.target.value } }))
                    }
                  />
                </div>
                <div>
                  <label className="label-eyebrow">Percentage</label>
                  <input
                    className="input-field mt-1"
                    type="number"
                    step="0.01"
                    value={draft.percentage ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [rule.id]: { ...draft, percentage: e.target.value } }))
                    }
                  />
                </div>
                <div>
                  <label className="label-eyebrow">Min / Max</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      className="input-field"
                      type="number"
                      step="0.01"
                      placeholder="min"
                      value={draft.minimum_amount ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [rule.id]: { ...draft, minimum_amount: e.target.value },
                        }))
                      }
                    />
                    <input
                      className="input-field"
                      type="number"
                      step="0.01"
                      placeholder="max"
                      value={draft.maximum_amount ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [rule.id]: { ...draft, maximum_amount: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
                <button
                  className="btn-primary !py-2"
                  disabled={savingId === rule.id}
                  onClick={() => saveRule(rule)}
                  data-testid={`save-rule-${rule.rule_type}`}
                >
                  {savingId === rule.id ? "Saving…" : "Save"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="font-display text-2xl font-bold mb-4">AI recommendations</h2>
          {recs.length === 0 ? (
            <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>
              No recommendations right now — marketplace signals are balanced.
            </div>
          ) : (
            <div className="space-y-3">
              {recs.map((r) => (
                <div key={r.id} className="card p-4" data-testid={`rec-${r.id}`}>
                  <div className="font-bold">{r.title}</div>
                  <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{r.rationale}</p>
                  <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                    {r.suggestedRuleType}: {r.suggestedPercentage != null ? `${r.suggestedPercentage}%` : `$${formatMoney(r.suggestedValue)}`}
                    {" · "}confidence {Math.round(r.confidence * 100)}%
                    {r.withinLimits ? " · within limits" : " · clamped to limits"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display text-2xl font-bold mb-4">Marketplace analytics</h2>
          <div className="card p-5 space-y-3 text-sm">
            <div className="flex justify-between"><span>Driver bonus costs</span><span>${formatMoney(driver.bonus_costs)}</span></div>
            <div className="flex justify-between"><span>Restaurant sales</span><span>${formatMoney(restaurant.sales_volume)}</span></div>
            <div className="flex justify-between"><span>Restaurant payouts</span><span>${formatMoney(restaurant.payout_total)}</span></div>
            <div className="flex justify-between"><span>Commission impact</span><span>${formatMoney(restaurant.commission_impact)}</span></div>
            <div className="flex justify-between"><span>Promotion costs</span><span>${formatMoney(platform.promotion_costs)}</span></div>
            <div className="flex justify-between"><span>Delivery costs</span><span>${formatMoney(platform.delivery_costs)}</span></div>
          </div>

          <h3 className="font-display text-xl font-bold mt-8 mb-3">Promotions</h3>
          <div className="card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input-field"
                placeholder="CODE"
                value={promoForm.code}
                onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                data-testid="promo-code-input"
              />
              <select
                className="input-field"
                value={promoForm.discount_type}
                onChange={(e) => setPromoForm({ ...promoForm, discount_type: e.target.value })}
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed $</option>
                <option value="free_delivery">Free delivery</option>
              </select>
              <input
                className="input-field"
                type="number"
                placeholder="Value"
                value={promoForm.discount_value}
                onChange={(e) => setPromoForm({ ...promoForm, discount_value: e.target.value })}
              />
              <input
                className="input-field"
                type="number"
                placeholder="Usage limit"
                value={promoForm.usage_limit}
                onChange={(e) => setPromoForm({ ...promoForm, usage_limit: e.target.value })}
              />
            </div>
            <button className="btn-primary w-full !py-2" onClick={createPromo} data-testid="promo-create">
              Create promotion
            </button>
            <div className="space-y-2 max-h-48 overflow-auto">
              {promos.map((p) => (
                <div key={p.id} className="text-sm flex justify-between border-t pt-2" style={{ borderColor: "var(--border)" }}>
                  <span className="font-bold">{p.code}</span>
                  <span style={{ color: "var(--muted)" }}>
                    {p.discount_type} {p.discount_value} · {p.active ? "active" : "off"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
