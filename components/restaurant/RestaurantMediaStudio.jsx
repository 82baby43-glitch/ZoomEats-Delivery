"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ImagePlus, RefreshCw, Sparkles, X } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import { enhanceFoodPhoto, revokeEnhancePreview } from "@/lib/compliance/imageEnhance";

const STEP_LABELS = {
  background_removed: "Background cleaned",
  lighting_improved: "Lighting improved",
  color_corrected: "Colors corrected",
  professional_crop: "Professional crop",
  resolution_enhanced: "Resolution enhanced",
  sharpened: "Sharpened",
  menu_ready: "Menu-ready version",
};

async function uploadToStorage(uploadUrl, file, contentType, token) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-upsert": "true",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });
  if (!res.ok) throw new Error("Upload failed");
}

export default function RestaurantMediaStudio({ onPublished }) {
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [originalPreview, setOriginalPreview] = useState(null);
  const [enhancementId, setEnhancementId] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [itemDraft, setItemDraft] = useState({ name: "", description: "", price: "", category: "Mains" });

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get("/vendor/media/enhancements");
      setHistory(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const resetDraft = () => {
    if (preview) revokeEnhancePreview(preview);
    if (originalPreview) revokeEnhancePreview(originalPreview);
    setPreview(null);
    setOriginalPreview(null);
    setEnhancementId(null);
    setMetadata(null);
    setItemDraft({ name: "", description: "", price: "", category: "Mains" });
  };

  const processFile = async (file) => {
    if (!file) return;
    setBusy(true);
    resetDraft();
    try {
      const originalUrl = URL.createObjectURL(file);
      setOriginalPreview(originalUrl);

      const enhanced = await enhanceFoodPhoto(file);
      setPreview(enhanced.previewUrl);
      setMetadata(enhanced.metadata);

      const origPresign = await api.post("/vendor/media/presign", {
        kind: "original",
        file_name: file.name,
        content_type: file.type || "image/jpeg",
      });
      const { enhancement_id, upload_url, storage_path: originalPath, token } = origPresign?.data || {};
      if (!upload_url || !enhancement_id) throw new Error("Upload URL unavailable");
      await uploadToStorage(upload_url, file, file.type || "image/jpeg", token);

      const enhPresign = await api.post("/vendor/media/presign", {
        kind: "enhanced",
        file_name: `enhanced_${file.name.replace(/\.\w+$/, ".jpg")}`,
        content_type: "image/jpeg",
        enhancement_id,
      });
      const { upload_url: enhUrl, storage_path: enhancedPath, token: enhToken } = enhPresign?.data || {};
      if (!enhUrl) throw new Error("Enhanced upload URL unavailable");
      await uploadToStorage(enhUrl, enhanced.blob, "image/jpeg", enhToken);

      await api.post("/vendor/media/enhancements", {
        enhancement_id,
        original_path: originalPath,
        enhanced_path: enhancedPath,
        metadata: enhanced.metadata,
      });

      setEnhancementId(enhancement_id);
      await loadHistory();
    } catch (e) {
      alert(getApiErrorMessage(e, "Photo enhancement failed"));
      resetDraft();
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!enhancementId) return;
    setBusy(true);
    try {
      const res = await api.post(`/vendor/media/enhancements/${enhancementId}/approve`, {
        menu_item: itemDraft.name ? {
          ...itemDraft,
          price: parseFloat(itemDraft.price) || 0,
        } : undefined,
      });
      alert("Published to menu!");
      resetDraft();
      await loadHistory();
      onPublished?.(res?.data);
    } catch (e) {
      alert(getApiErrorMessage(e, "Publish failed"));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (id) => {
    try {
      await api.post(`/vendor/media/enhancements/${id}/reject`, {});
      if (id === enhancementId) resetDraft();
      await loadHistory();
    } catch (e) {
      alert(getApiErrorMessage(e, "Reject failed"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="label-eyebrow flex items-center gap-2">
              <Sparkles size={14} /> AI Menu Photo Studio
            </div>
            <h3 className="font-display text-xl font-bold mt-1">Enhance food photos</h3>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Upload a dish photo — we clean the background, fix lighting and colors, crop professionally, and sharpen for your menu. You approve before anything goes live.
            </p>
          </div>
          <label className="btn-primary inline-flex items-center gap-2 cursor-pointer">
            <ImagePlus size={16} />
            {busy ? "Processing…" : "Upload photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => processFile(e.target.files?.[0])}
            />
          </label>
        </div>

        {(originalPreview || preview) && (
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm font-bold mb-2">Original (kept)</div>
              {originalPreview ? (
                <img src={originalPreview} alt="Original" className="w-full rounded-xl border object-cover aspect-[4/3]" style={{ borderColor: "var(--border)" }} />
              ) : (
                <div className="aspect-[4/3] rounded-xl" style={{ background: "var(--surface-2)" }} />
              )}
            </div>
            <div>
              <div className="text-sm font-bold mb-2 flex items-center gap-2">
                Menu-ready preview
                {busy && <RefreshCw size={14} className="animate-spin" />}
              </div>
              {preview ? (
                <img src={preview} alt="Enhanced" className="w-full rounded-xl border object-cover aspect-[4/3]" style={{ borderColor: "var(--primary)" }} />
              ) : (
                <div className="aspect-[4/3] rounded-xl flex items-center justify-center text-sm" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                  Enhancing…
                </div>
              )}
            </div>
          </div>
        )}

        {metadata?.steps?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {metadata.steps.filter((s) => STEP_LABELS[s]).map((s) => (
              <span key={s} className="badge text-xs">{STEP_LABELS[s]}</span>
            ))}
          </div>
        )}

        {enhancementId && preview && (
          <div className="mt-6 p-4 rounded-xl space-y-4" style={{ background: "var(--surface-2)" }}>
            <div className="font-bold">Publish to menu (optional)</div>
            <div className="grid md:grid-cols-2 gap-3">
              <input className="input-field" placeholder="Item name" value={itemDraft.name} onChange={(e) => setItemDraft((d) => ({ ...d, name: e.target.value }))} />
              <input className="input-field" placeholder="Price" type="number" step="0.01" value={itemDraft.price} onChange={(e) => setItemDraft((d) => ({ ...d, price: e.target.value }))} />
              <input className="input-field md:col-span-2" placeholder="Description" value={itemDraft.description} onChange={(e) => setItemDraft((d) => ({ ...d, description: e.target.value }))} />
              <select className="input-field" value={itemDraft.category} onChange={(e) => setItemDraft((d) => ({ ...d, category: e.target.value }))}>
                {["Starters", "Mains", "Sides", "Desserts", "Drinks"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={busy} onClick={approve}>
                <Check size={16} /> Approve & publish
              </button>
              <button type="button" className="btn-ghost inline-flex items-center gap-2" disabled={busy} onClick={() => reject(enhancementId)}>
                <X size={16} /> Reject
              </button>
            </div>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <h4 className="font-bold mb-3">Recent enhancements</h4>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map((h) => (
              <div key={h.enhancement_id} className="card p-3">
                <div className="grid grid-cols-2 gap-2">
                  {h.original_url && <img src={h.original_url} alt="Original" className="rounded-lg aspect-square object-cover" />}
                  {h.enhanced_url && <img src={h.enhanced_url} alt="Enhanced" className="rounded-lg aspect-square object-cover" />}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="badge capitalize">{h.status}</span>
                  <span style={{ color: "var(--muted)" }}>{h.created_at ? new Date(h.created_at).toLocaleDateString() : ""}</span>
                </div>
                {h.status === "enhanced" && (
                  <button type="button" className="btn-primary w-full mt-2 !py-1.5 text-xs" onClick={() => {
                    setEnhancementId(h.enhancement_id);
                    setPreview(h.enhanced_url);
                    setOriginalPreview(h.original_url);
                  }}>
                    Review
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
