"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SPOTLIGHT_FILTER_LABELS } from "@/lib/spotlight/types";
import { LoadingSkeleton } from "@/components/ui/PageStates";

const TAGS = Object.keys(SPOTLIGHT_FILTER_LABELS);

export default function VendorCommunityProfile() {
  const [loading, setLoading] = useState(true);
  const [spotlight, setSpotlight] = useState(null);
  const [form, setForm] = useState({
    title: "",
    story: "",
    owner_message: "",
    cover_image_url: "",
    logo_url: "",
    video_url: "",
    promotion_text: "",
    featured_menu_items: [],
    spotlight_tags: [],
  });
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/vendor/community-profile");
      const s = res?.data?.spotlight;
      setSpotlight(s);
      if (s) {
        setForm({
          title: s.title || "",
          story: s.story || "",
          owner_message: s.owner_message || "",
          cover_image_url: s.cover_image_url || "",
          logo_url: s.logo_url || "",
          video_url: s.video_url || "",
          promotion_text: s.promotion_text || "",
          featured_menu_items: s.featured_menu_items || [],
          spotlight_tags: s.spotlight_tags || [],
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (submitForReview = false) => {
    setMessage("");
    const res = await api.post("/vendor/community-profile", { ...form, submit_for_review: submitForReview });
    setSpotlight(res?.data);
    setMessage(submitForReview ? "Submitted for admin approval." : "Draft saved.");
  };

  const toggleTag = (tag) => {
    setForm((f) => ({
      ...f,
      spotlight_tags: f.spotlight_tags.includes(tag)
        ? f.spotlight_tags.filter((t) => t !== tag)
        : [...f.spotlight_tags, tag],
    }));
  };

  const addDish = () => {
    setForm((f) => ({
      ...f,
      featured_menu_items: [...(f.featured_menu_items || []), { name: "", price: "", description: "", image_url: "" }],
    }));
  };

  const updateDish = (index, patch) => {
    setForm((f) => {
      const items = [...(f.featured_menu_items || [])];
      items[index] = { ...items[index], ...patch };
      return { ...f, featured_menu_items: items };
    });
  };

  if (loading) return <LoadingSkeleton label="Loading community profile…" rows={4} />;

  return (
    <div className="card p-6 mt-6 space-y-4 max-w-3xl" data-testid="vendor-community-profile">
      <div>
        <div className="label-eyebrow">Community Profile</div>
        <h2 className="font-display text-2xl font-black">Local Partner Spotlight submission</h2>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Share your story for the ZoomEats Local Partner Spotlight. Admin approval required before publishing.
        </p>
        {spotlight?.status && (
          <div className="badge mt-2">Status: {spotlight.status.replace(/_/g, " ")}</div>
        )}
      </div>

      <input className="input-field" placeholder="Spotlight title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <textarea className="input-field" rows={4} placeholder="Your business story" value={form.story} onChange={(e) => setForm({ ...form, story: e.target.value })} />
      <textarea className="input-field" rows={3} placeholder="Owner introduction" value={form.owner_message} onChange={(e) => setForm({ ...form, owner_message: e.target.value })} />
      <input className="input-field" placeholder="Cover image URL" value={form.cover_image_url} onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })} />
      <input className="input-field" placeholder="Logo URL" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
      <input className="input-field" placeholder="Video URL (optional)" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} />
      <input className="input-field" placeholder="Special offer / promotion" value={form.promotion_text} onChange={(e) => setForm({ ...form, promotion_text: e.target.value })} />

      <div>
        <div className="text-sm font-bold mb-2">Tags</div>
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
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold">Featured dishes</div>
          <button type="button" className="btn-secondary !py-1 text-xs" onClick={addDish}>Add dish</button>
        </div>
        {(form.featured_menu_items || []).map((dish, i) => (
          <div key={i} className="grid gap-2 mb-3 p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
            <input className="input-field" placeholder="Dish name" value={dish.name || ""} onChange={(e) => updateDish(i, { name: e.target.value })} />
            <input className="input-field" placeholder="Price" value={dish.price || ""} onChange={(e) => updateDish(i, { price: e.target.value })} />
            <input className="input-field" placeholder="Image URL" value={dish.image_url || ""} onChange={(e) => updateDish(i, { image_url: e.target.value })} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => save(false)}>Save draft</button>
        <button type="button" className="btn-primary" onClick={() => save(true)}>Submit for approval</button>
      </div>
      {message && <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>{message}</p>}
    </div>
  );
}
