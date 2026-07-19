"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { FIELD_LABELS } from "@/lib/pricing/ruleFields";
import { Settings2, Save, SlidersHorizontal } from "lucide-react";
import { logClientError } from "@/lib/clientErrorLog";

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function fieldValue(row, field) {
  const v = row?.[field];
  return v != null && v !== "" ? String(v) : "";
}

export default function PricingRulesDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [edits, setEdits] = useState({});
  const [saved, setSaved] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/pricing/rules/dashboard");
      setDashboard(res?.data || null);
    } catch (e) {
      logClientError("admin.pricingRules.load", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeRules = dashboard?.rules || {};
  const promotionBudget = dashboard?.promotion_budget;

  const updateEdit = (ruleType, field, value) => {
    setEdits((prev) => ({
      ...prev,
      [ruleType]: { ...(prev[ruleType] || activeRules[ruleType] || {}), [field]: value },
    }));
  };

  const saveRule = async (ruleType, meta) => {
    const base = activeRules[ruleType] || {};
    const patch = edits[ruleType] || base;
    setBusy(ruleType);
    try {
      const body = {
        rule_name: patch.rule_name || meta.label,
        rule_type: ruleType,
        active: true,
      };
      for (const field of meta.fields) {
        const raw = patch[field];
        if (raw === "" || raw == null) continue;
        body[field] = Number(raw);
      }
      await api.post("/admin/pricing/rules", body);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[ruleType];
        return next;
      });
      setSaved(ruleType);
      setTimeout(() => setSaved(null), 2000);
      await load();
    } catch (e) {
      alert(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const renderFields = (ruleType, fields) => {
    const row = edits[ruleType] || activeRules[ruleType] || {};
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {fields.map((field) => (
          <label key={field} className="text-sm">
            <span className="label-eyebrow">{FIELD_LABELS[field]}</span>
            <input
              className="input-field mt-1"
              type="number"
              step={field === "percentage" ? "0.01" : "0.01"}
              value={fieldValue(row, field)}
              onChange={(e) => updateEdit(ruleType, field, e.target.value)}
            />
          </label>
        ))}
      </div>
    );
  };

  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl font-black tracking-tighter flex items-center gap-3">
              <SlidersHorizontal size={32} /> Pricing Rules
            </h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Adjust marketplace pricing live — changes apply immediately, no deploy required.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/pricing" className="btn-secondary text-sm">Pricing Engine</Link>
            <Link href="/admin" className="btn-ghost text-sm">← Admin</Link>
          </div>
        </div>

        {promotionBudget && !promotionBudget.unlimited && (
          <div className="card p-4 mb-6">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span style={{ color: "var(--muted)" }}>Promotion budget (this month)</span>
              <span>
                <strong>{money(promotionBudget.spent)}</strong> of {money(promotionBudget.cap)} used
                · {money(promotionBudget.remaining)} remaining
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (promotionBudget.spent / Math.max(promotionBudget.cap, 1)) * 100)}%`,
                  background: "var(--primary)",
                }}
              />
            </div>
          </div>
        )}

        {loading ? (
          <p>Loading pricing rules…</p>
        ) : (
          <div className="space-y-8">
            {(dashboard?.sections || []).map((section) => (
              <section key={section.id}>
                <div className="mb-4">
                  <h2 className="font-display text-xl font-bold flex items-center gap-2">
                    <Settings2 size={18} /> {section.title}
                  </h2>
                  <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{section.description}</p>
                </div>
                <div className="space-y-4">
                  {section.rules.map((rule) => (
                    <div key={rule.type} className="card p-5 space-y-3" data-testid={`pricing-rule-${rule.type}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold">{rule.label}</div>
                          {rule.help && (
                            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{rule.help}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn-primary text-sm inline-flex items-center gap-1 shrink-0"
                          disabled={busy === rule.type}
                          onClick={() => saveRule(rule.type, rule)}
                        >
                          <Save size={14} />
                          {saved === rule.type ? "Saved" : busy === rule.type ? "Saving…" : "Save"}
                        </button>
                      </div>
                      {renderFields(rule.type, rule.fields)}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
