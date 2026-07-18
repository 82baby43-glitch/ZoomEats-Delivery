"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function MerchantDocumentUpload({ documentType, label, onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/onboarding/restaurant/ensure-stub", {});
      const presign = await api.post("/uploads/presign", {
        document_type: documentType,
        file_name: file.name,
        content_type: file.type || "application/pdf",
        entity_type: "restaurant",
      });
      const { upload_url, document_id, token } = presign?.data || {};
      if (!upload_url) throw new Error("Upload URL unavailable");
      await fetch(upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/pdf",
          "x-upsert": "true",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });
      await api.post("/uploads/complete", { document_id, entity_type: "restaurant" });
      setDone(true);
      onUploaded?.();
    } catch (e) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2" data-testid={`merchant-doc-upload-${documentType}`}>
      <div className="text-sm font-bold">{label}</div>
      <input
        type="file"
        accept="image/*,.pdf,application/pdf"
        disabled={busy || done}
        onChange={(e) => upload(e.target.files?.[0])}
        className="text-sm"
      />
      {done && <p className="text-xs text-green-400">Document uploaded — pending admin review</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {busy && <p className="text-xs" style={{ color: "var(--muted)" }}>Uploading…</p>}
    </div>
  );
}
