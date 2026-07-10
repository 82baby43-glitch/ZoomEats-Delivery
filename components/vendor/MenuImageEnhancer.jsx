"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Sparkles, Upload, Image as ImageIcon } from "lucide-react";

export default function MenuImageEnhancer({ imageUrl, onImageUrl }) {
  const inputRef = useRef(null);
  const [quota, setQuota] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [preview, setPreview] = useState({ original: null, enhanced: null });
  const [error, setError] = useState("");

  const loadQuota = useCallback(async () => {
    try {
      const res = await api.get("/vendor/menu-images/quota");
      setQuota(res?.data ?? null);
    } catch {
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    loadQuota();
  }, [loadQuota]);

  const uploadAndEnhance = async (file) => {
    if (!file) return;
    setError("");
    setUploading(true);
    setPreview({ original: URL.createObjectURL(file), enhanced: null });
    try {
      const presign = await api.post("/vendor/menu-images/presign", {
        file_name: file.name,
        content_type: file.type || "image/jpeg",
      });
      const { upload_url, storage_path, token } = presign?.data || {};
      if (!upload_url || !storage_path) throw new Error("Could not prepare upload");

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "image/jpeg",
          ...(token ? { "x-upsert": "true" } : {}),
        },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload failed");

      setUploading(false);
      setEnhancing(true);
      const enhanced = await api.post("/vendor/menu-images/enhance", { storage_path });
      const data = enhanced?.data;
      if (!data?.enhanced_url) throw new Error(data?.error || "Enhancement failed");

      setPreview((p) => ({ ...p, enhanced: data.enhanced_url }));
      onImageUrl?.(data.enhanced_url);
      setQuota((q) =>
        q
          ? { ...q, used: data.used, remaining: data.remaining }
          : { used: data.used, remaining: data.remaining, limit: data.limit }
      );
    } catch (e) {
      setError(e?.message || "Could not enhance image");
    } finally {
      setUploading(false);
      setEnhancing(false);
    }
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadAndEnhance(file);
    e.target.value = "";
  };

  const remaining = quota?.remaining ?? 5;
  const disabled = uploading || enhancing || remaining <= 0;

  return (
    <div className="card p-4 space-y-3" style={{ background: "var(--surface-2)" }} data-testid="menu-image-enhancer">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold flex items-center gap-2">
            <Sparkles size={16} style={{ color: "var(--primary)" }} />
            AI menu photo — Clean &amp; bright
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Upload a phone photo. We polish it with a clean white background for your menu.
          </p>
        </div>
        <div className="text-xs font-bold badge shrink-0">
          {remaining} free left
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileChange}
      />

      <button
        type="button"
        className="btn-secondary w-full flex items-center justify-center gap-2 !py-2 text-sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        data-testid="menu-enhance-upload-btn"
      >
        <Upload size={16} />
        {uploading ? "Uploading…" : enhancing ? "Enhancing…" : "Upload & enhance photo"}
      </button>

      {(preview.original || preview.enhanced || imageUrl) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Original</div>
            {preview.original ? (
              <img src={preview.original} alt="Original" className="w-full h-24 object-cover rounded-lg" />
            ) : (
              <div className="h-24 rounded-lg flex items-center justify-center" style={{ background: "var(--surface)" }}>
                <ImageIcon size={20} style={{ color: "var(--muted)" }} />
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Enhanced</div>
            <img
              src={preview.enhanced || imageUrl || preview.original}
              alt="Enhanced menu"
              className="w-full h-24 object-cover rounded-lg ring-2"
              style={{ borderColor: "var(--primary)" }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      {remaining <= 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          You&apos;ve used all {quota?.limit ?? 5} free enhancements. Paste an image URL or contact ZoomEats for more.
        </p>
      )}
    </div>
  );
}
