"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { Store, ToggleLeft, ToggleRight, Plus, BarChart3 } from "lucide-react";
import { logClientError } from "@/lib/clientErrorLog";

export default function AdminMarketplaceManager() {
  const [categories, setCategories] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ label: "", icon: "🏪", color: "#B6F127" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, stats] = await Promise.all([
        api.get("/admin/marketplace/categories"),
        api.get("/admin/marketplace/analytics"),
      ]);
      setCategories(Array.isArray(cats?.data) ? cats.data : []);
      setAnalytics(Array.isArray(stats?.data) ? stats.data : []);
    } catch (e) {
      logClientError("admin.marketplace.load", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleEnabled = async (slug, enabled) => {
    setBusy(slug);
    try {
      await api.patch(`/admin/marketplace/categories/${slug}`, { enabled: !enabled });
      await load();
    } catch (e) {
      alert(e?.message || "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const createCategory = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) return;
    setBusy("create");
    try {
      await api.post("/admin/marketplace/categories", {
        label: form.label.trim(),
        icon: form.icon || "🏪",
        color: form.color,
        enabled: false,
        visible: true,
      });
      setForm({ label: "", icon: "🏪", color: "#B6F127" });
      await load();
    } catch (err) {
      alert(err?.message || "Create failed");
    } finally {
      setBusy(null);
    }
  };

  const enabledCount = categories.filter((c) => c.enabled).length;

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-eyebrow">Marketplace</div>
            <h1 className="font-display text-4xl font-black tracking-tighter">Marketplace Manager</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Enable categories without code deploys. Restaurants remain the default merchant type.
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">← Admin dashboard</Link>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="text-sm" style={{ color: "var(--muted)" }}>Enabled categories</div>
            <div className="font-display text-3xl font-bold mt-1">{enabledCount}</div>
          </div>
          <div className="card p-5">
            <div className="text-sm" style={{ color: "var(--muted)" }}>Total categories</div>
            <div className="font-display text-3xl font-bold mt-1">{categories.length}</div>
          </div>
          <div className="card p-5 flex items-center gap-3">
            <BarChart3 size={28} style={{ color: "var(--primary)" }} />
            <div>
              <div className="text-sm font-bold">30-day revenue by category</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{analytics.length} active categories</div>
            </div>
          </div>
        </div>

        <div className="mt-10 card p-6">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Store size={20} /> Merchant categories
          </h2>
          {loading ? (
            <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>Loading…</p>
          ) : (
            <div className="mt-4 space-y-3">
              {categories.map((cat) => (
                <div
                  key={cat.slug}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border"
                  style={{ borderColor: "var(--border)" }}
                  data-testid={`marketplace-category-${cat.slug}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl" aria-hidden>{cat.icon}</span>
                    <div>
                      <div className="font-bold">{cat.label}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {cat.slug}
                        {cat.custom ? " · custom" : ""}
                        {!cat.delivery_enabled ? " · pickup only" : ""}
                        {cat.compliance_settings?.age_verification ? " · age verify" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ background: cat.color }}
                      title={cat.color}
                    />
                    <button
                      type="button"
                      className="btn-ghost text-sm inline-flex items-center gap-2"
                      disabled={busy === cat.slug}
                      onClick={() => toggleEnabled(cat.slug, cat.enabled)}
                      data-testid={`toggle-category-${cat.slug}`}
                    >
                      {cat.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      {cat.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form className="mt-8 card p-6" onSubmit={createCategory}>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Plus size={20} /> Create custom category
          </h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              className="input-field md:col-span-2"
              placeholder="Category name"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              required
            />
            <input
              className="input-field"
              placeholder="Icon (emoji)"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
            />
            <input
              className="input-field"
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              title="Category color"
            />
          </div>
          <button className="btn-primary mt-4" type="submit" disabled={busy === "create"}>
            Add category (starts disabled)
          </button>
        </form>

        {analytics.length > 0 && (
          <div className="mt-8 card p-6">
            <h2 className="font-display text-xl font-bold">Category analytics (30 days)</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: "var(--muted)" }}>
                    <th className="py-2">Category</th>
                    <th className="py-2">Orders</th>
                    <th className="py-2">Revenue</th>
                    <th className="py-2">Merchants</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map((row) => (
                    <tr key={row.category_slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 font-mono text-xs">{row.category_slug}</td>
                      <td className="py-2">{row.orders}</td>
                      <td className="py-2">${Number(row.revenue).toFixed(2)}</td>
                      <td className="py-2">{row.merchant_count}</td>
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
