"use client";

import { useEffect, useState } from "react";
import { X, Download, FileText } from "lucide-react";
import { api } from "@/lib/api";

export default function AdminAgreementViewer({ acceptanceId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!acceptanceId) return;
    setLoading(true);
    api.get(`/admin/compliance/agreements/${acceptanceId}/viewer`)
      .then((r) => setData(r?.data))
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [acceptanceId]);

  const downloadPdf = async () => {
    try {
      const r = await api.get(`/admin/compliance/agreements/${acceptanceId}/pdf`);
      if (r?.data?.url) window.open(r.data.url, "_blank");
    } catch (e) {
      alert(e?.message || "Download failed");
    }
  };

  if (!acceptanceId) return null;
  const a = data?.acceptance;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 relative">
        <button type="button" className="absolute top-4 right-4 btn-ghost !p-2" onClick={onClose}><X size={20} /></button>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading agreement…</p>
        ) : !data ? (
          <p>Could not load agreement.</p>
        ) : (
          <>
            <h2 className="font-display text-xl font-bold pr-10 flex items-center gap-2">
              <FileText size={20} /> {data.agreement?.title || a.agreement_type}
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {data.user?.name} · {data.user?.email} · v{a.agreement_version}
            </p>

            <div className="mt-4 p-4 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
              <p>{data.agreement?.body}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><span style={{ color: "var(--muted)" }}>Method</span><br /><strong>{a.signature_method || "typed"}</strong></div>
              <div><span style={{ color: "var(--muted)" }}>Initials</span><br /><strong>{a.initials || "—"}</strong></div>
              <div><span style={{ color: "var(--muted)" }}>Signature</span><br /><strong>{a.signature || a.typed_name}</strong></div>
              <div><span style={{ color: "var(--muted)" }}>Signed</span><br /><strong>{new Date(a.accepted_at).toLocaleString()}</strong></div>
              <div><span style={{ color: "var(--muted)" }}>IP</span><br /><strong>{a.ip_address || "—"}</strong></div>
              <div><span style={{ color: "var(--muted)" }}>Device / Browser</span><br /><strong>{a.device || "—"} · {a.browser || "—"}</strong></div>
            </div>

            {data.signature_image_url && (
              <div className="mt-4">
                <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Signature image</p>
                <img src={data.signature_image_url} alt="Signature" className="max-h-24 bg-white rounded border p-2" />
              </div>
            )}

            <div className="mt-6 flex gap-2">
              {a.signed_pdf_path && (
                <button type="button" className="btn-primary inline-flex items-center gap-2 !py-2 text-sm" onClick={downloadPdf}>
                  <Download size={14} /> Download signed PDF
                </button>
              )}
              <button type="button" className="btn-ghost !py-2 text-sm" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
