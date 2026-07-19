"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { Percent, Save, Plus, Store } from "lucide-react";
import { logClientError } from "@/lib/clientErrorLog";
import { sanitizeRestaurants } from "@/lib/safeData";

export default function CommissionManager() {
  const [plans, setPlans] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [newPlan, setNewPlan] = useState({ slug: "", name: "", description: "", commission_percent: "15" });
  const [assignments, setAssignments] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, restRes] = await Promise.all([
        api.get("/admin/commission/plans"),
        api.get("/admin/restaurants"),
      ]);
      setPlans(Array.isArray(plansRes?.data) ? plansRes.data : []);
      setRestaurants(sanitizeRestaurants(restRes?.data));
    } catch (e) {
      logClientError("admin.commission.load", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createPlan = async () => {
    if (!newPlan.slug.trim()) return;
    setBusy("create");
    try {
      await api.post("/admin/commission/plans", {
        slug: newPlan.slug.trim().toLowerCase(),
        name: newPlan.name || newPlan.slug,
        description: newPlan.description || null,
        commission_percent: Number(newPlan.commission_percent),
      });
      setNewPlan({ slug: "", name: "", description: "", commission_percent: "15" });
      await load();
    } catch (e) {
      alert(e?.message || "Create failed");
    } finally {
      setBusy(null);
    }
  };

  const assignPlan = async (restaurantId) => {
    const patch = assignments[restaurantId];
    if (!patch?.plan_slug) return;
    setBusy(restaurantId);
    try {
      await api.patch(`/admin/restaurants/${restaurantId}/commission`, {
        commission_plan_slug: patch.plan_slug,
        clear_override: patch.clear_override,
      });
      await load();
    } catch (e) {
      alert(e?.message || "Assignment failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl font-black tracking-tighter flex items-center gap-3">
              <Percent size={32} /> Commission Engine
            </h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Merchant-specific commission plans and payout configuration
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">← Admin</Link>
        </div>

        {loading ? (
          <p>Loading commission plans…</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {plans.map((p) => (
                <div key={p.id} className="card p-4">
                  <div className="font-display text-lg font-bold">{p.name}</div>
                  <div className="text-2xl font-black mt-1">{Number(p.commission_percent).toFixed(1)}%</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{p.slug}</div>
                  {p.description && (
                    <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{p.description}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="card p-6 mb-8 space-y-4">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <Plus size={20} /> New commission plan
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="text-sm">
                  <span className="label-eyebrow">Slug</span>
                  <input className="input-field mt-1" value={newPlan.slug} onChange={(e) => setNewPlan({ ...newPlan, slug: e.target.value })} placeholder="enterprise" />
                </label>
                <label className="text-sm">
                  <span className="label-eyebrow">Name</span>
                  <input className="input-field mt-1" value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} placeholder="Enterprise" />
                </label>
                <label className="text-sm">
                  <span className="label-eyebrow">Rate (%)</span>
                  <input className="input-field mt-1" type="number" step="0.01" value={newPlan.commission_percent} onChange={(e) => setNewPlan({ ...newPlan, commission_percent: e.target.value })} />
                </label>
                <label className="text-sm sm:col-span-2 lg:col-span-1">
                  <span className="label-eyebrow">Description</span>
                  <input className="input-field mt-1" value={newPlan.description} onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })} />
                </label>
              </div>
              <button className="btn-primary inline-flex items-center gap-2" onClick={createPlan} disabled={busy === "create"}>
                <Save size={16} /> Create plan
              </button>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <Store size={20} /> Restaurant assignments
              </h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Override rate on a restaurant record takes priority over plan assignment.
              </p>
              <div className="space-y-3">
                {restaurants.length === 0 && (
                  <p style={{ color: "var(--muted)" }}>No restaurants found.</p>
                )}
                {restaurants.map((r) => (
                  <div key={r.restaurant_id} className="flex flex-wrap items-center gap-3 p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-bold">{r.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {r.commission_rate != null ? `Override: ${r.commission_rate}%` : "Plan-based"}
                      </div>
                    </div>
                    <select
                      className="input-field"
                      style={{ width: 180 }}
                      value={assignments[r.restaurant_id]?.plan_slug ?? ""}
                      onChange={(e) =>
                        setAssignments((prev) => ({
                          ...prev,
                          [r.restaurant_id]: { ...prev[r.restaurant_id], plan_slug: e.target.value },
                        }))
                      }
                    >
                      <option value="">Select plan…</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.slug}>{p.name} ({p.commission_percent}%)</option>
                      ))}
                    </select>
                    <label className="text-xs flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(assignments[r.restaurant_id]?.clear_override)}
                        onChange={(e) =>
                          setAssignments((prev) => ({
                            ...prev,
                            [r.restaurant_id]: { ...prev[r.restaurant_id], clear_override: e.target.checked },
                          }))
                        }
                      />
                      Clear override
                    </label>
                    <button
                      className="btn-secondary text-sm"
                      disabled={busy === r.restaurant_id}
                      onClick={() => assignPlan(r.restaurant_id)}
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
