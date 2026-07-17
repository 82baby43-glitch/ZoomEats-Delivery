"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function DreamlandPreferencesModal({ open, onClose }) {
  const [form, setForm] = useState({
    favorite_cuisines: "",
    budget_max: "",
    prefers_healthy: false,
    prefers_fast: false,
    avoid_ingredients: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const r = await api.get("/dreamland/preferences");
        const p = r?.data || {};
        setForm({
          favorite_cuisines: (p.favorite_cuisines || []).join(", "),
          budget_max: p.budget_max != null ? String(p.budget_max) : "",
          prefers_healthy: Boolean(p.prefers_healthy),
          prefers_fast: Boolean(p.prefers_fast),
          avoid_ingredients: (p.avoid_ingredients || []).join(", "),
        });
      } catch {
        // ignore
      }
    })();
  }, [open]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.put("/dreamland/preferences", {
        favorite_cuisines: form.favorite_cuisines.split(",").map((s) => s.trim()).filter(Boolean),
        avoid_ingredients: form.avoid_ingredients.split(",").map((s) => s.trim()).filter(Boolean),
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        prefers_healthy: form.prefers_healthy,
        prefers_fast: form.prefers_fast,
      });
      setMessage("Preferences saved");
    } catch (e) {
      setMessage(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="card w-full max-w-md p-5 space-y-3" data-testid="dreamland-preferences-modal">
        <h3 className="font-display font-bold text-lg">Dreamland settings</h3>
        <input className="input-field" placeholder="Favorite cuisines (comma separated)" value={form.favorite_cuisines} onChange={(e) => setForm({ ...form, favorite_cuisines: e.target.value })} />
        <input className="input-field" placeholder="Budget max ($)" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} />
        <input className="input-field" placeholder="Avoid ingredients" value={form.avoid_ingredients} onChange={(e) => setForm({ ...form, avoid_ingredients: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.prefers_healthy} onChange={(e) => setForm({ ...form, prefers_healthy: e.target.checked })} /> Prefer healthy meals</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.prefers_fast} onChange={(e) => setForm({ ...form, prefers_fast: e.target.checked })} /> Prefer fast delivery</label>
        {message && <p className="text-xs" style={{ color: "var(--muted)" }}>{message}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost text-sm" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary text-sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
