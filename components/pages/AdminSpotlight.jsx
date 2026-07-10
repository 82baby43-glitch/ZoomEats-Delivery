"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { SPOTLIGHT_FILTER_LABELS } from "@/lib/spotlight/types";
import { Archive, CheckCircle2, Plus, Sparkles } from "lucide-react";

const TAGS = Object.keys(SPOTLIGHT_FILTER_LABELS);

export default function AdminSpotlight() {
  const [spotlights, setSpotlights] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({
    restaurant_id: "",
    title: "",
    story: "",
    owner_message: "",
    promotion_text: "",
    spotlight_tags: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a, r] = await Promise.all([
        api.get("/admin/spotlight"),
        api.get("/admin/spotlight/analytics", { params: { days: "30" } }),
        api.get("/admin/restaurants"),
      ]);
      setSpotlights(Array.isArray(s?.data) ? s.data : []);
      setAnalytics(a?.data || null);
      setRestaurants(Array.isArray(r?.data) ? r.data : []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const publish = async (id) => {
    await api.post(`/admin/spotlight/${id}/publish`, { homepage_featured: true });
    load();
  };

  const archive = async (id) => {
    await api.post(`/admin/spotlight/${id}/archive`, {});
    load();
  };

  const createSpotlight = async () => {
    if (!form.restaurant_id) return;
    await api.post("/admin/spotlight", { ...form, status: "draft" });
    setForm({ restaurant_id: "", title: "", story: "", owner_message: "", promotion_text: "", spotlight_tags: [] });
    load();
  };

  const toggleTag = (tag) => {
    setForm((f) => ({
      ...f,
      spotlight_tags: f.spotlight_tags.includes(tag)
        ? f.spotlight_tags.filter((t) => t !== tag)
        : [...f.spotlight_tags, tag],
    }));
  };

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-eyebrow">Admin</div>
            <h1 className="font-display text-4xl font-black tracking-tight flex items-center gap-2">
              <Sparkles size={28} /> Local Partner Spotlight
            </h1>
          </div>
          <Link href="/admin" className="btn-secondary text-sm">Back to admin</Link>
        </div>

        {analytics && (
          <div className="card p-5 mt-6 grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="spotlight-analytics">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Views</div>
              <div className="font-display text-2xl font-black">{analytics.spotlight_view ?? 0}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Orders</div>
              <div className="font-display text-2xl font-black">{analytics.orders_generated ?? 0}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Conversion</div>
              <div className="font-display text-2xl font-black">{analytics.conversion_rate ?? 0}%</div>
            </div>
            <div className="md:col-span-1 col-span-2 text-sm" style={{ color: "var(--muted)" }}>
              {analytics.headline}
            </div>
          </div>
        )}

        <div className="card p-6 mt-6 space-y-4">
          <h2 className="font-display text-xl font-bold flex items-center gap-2"><Plus size={18} /> Create spotlight</h2>
          <select
            className="input-field"
            value={form.restaurant_id}
            onChange={(e) => setForm({ ...form, restaurant_id: e.target.value })}
          >
            <option value="">Choose restaurant…</option>
            {restaurants.map((r) => (
              <option key={r.restaurant_id} value={r.restaurant_id}>{r.name}</option>
            ))}
          </select>
          <input className="input-field" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className="input-field" rows={3} placeholder="Story" value={form.story} onChange={(e) => setForm({ ...form, story: e.target.value })} />
          <textarea className="input-field" rows={2} placeholder="Owner message" value={form.owner_message} onChange={(e) => setForm({ ...form, owner_message: e.target.value })} />
          <input className="input-field" placeholder="Promotion text" value={form.promotion_text} onChange={(e) => setForm({ ...form, promotion_text: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            {TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`badge ${form.spotlight_tags.includes(tag) ? "ring-2 ring-[var(--primary)]" : ""}`}
                onClick={() => toggleTag(tag)}
              >
                {SPOTLIGHT_FILTER_LABELS[tag]}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary" onClick={createSpotlight}>Create draft</button>
        </div>

        {loading && <div className="mt-6"><LoadingSkeleton label="Loading spotlights…" rows={4} /></div>}
        {error && <div className="mt-6"><ErrorState title="Could not load spotlights" onRetry={load} /></div>}

        <div className="mt-6 space-y-4">
          {spotlights.map((s) => {
            const r = s.restaurant || {};
            return (
              <div key={s.id} className="card p-5 flex flex-wrap justify-between gap-4">
                <div>
                  <div className="font-display text-xl font-bold">{s.title || r.name}</div>
                  <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                    {r.name} · <span className="badge">{s.status}</span>
                    {s.slug && (
                      <Link href={`/local-partners/${s.slug}`} className="ml-2 underline">
                        /local-partners/{s.slug}
                      </Link>
                    )}
                  </div>
                  <p className="text-sm mt-2 line-clamp-2">{s.story}</p>
                </div>
                <div className="flex flex-wrap gap-2 items-start">
                  {s.status === "pending_review" && (
                    <button type="button" className="btn-primary !py-2 text-sm flex items-center gap-1" onClick={() => publish(s.id)}>
                      <CheckCircle2 size={14} /> Approve & publish
                    </button>
                  )}
                  {s.status === "draft" && (
                    <button type="button" className="btn-primary !py-2 text-sm" onClick={() => publish(s.id)}>Publish</button>
                  )}
                  {s.status === "published" && (
                    <button type="button" className="btn-secondary !py-2 text-sm flex items-center gap-1" onClick={() => archive(s.id)}>
                      <Archive size={14} /> Archive
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
