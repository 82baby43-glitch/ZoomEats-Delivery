"use client";

import { useEffect, useState } from "react";
import { X, FileText, Check, Shield, Download, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";

export default function ComplianceDossier({ userId, onClose, onAction }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    api.get(`/admin/compliance/users/${userId}/dossier`)
      .then((r) => setData(r?.data))
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [userId]);

  const viewDoc = async (docId, entityType = "driver") => {
    try {
      const r = await api.get(`/admin/compliance/documents/${docId}/url`, { params: { entity_type: entityType } });
      if (r?.data?.url) window.open(r.data.url, "_blank");
      else alert("Document URL unavailable");
    } catch (e) {
      alert(e?.message || "Could not open document");
    }
  };

  const setBgStatus = async (status) => {
    setBusy(true);
    try {
      await api.post(`/admin/compliance/users/${userId}/background-check`, { status, notes: `Admin marked ${status}` });
      const r = await api.get(`/admin/compliance/users/${userId}/dossier`);
      setData(r?.data);
      onAction?.();
    } catch (e) {
      alert(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const setApproval = async (action) => {
    setBusy(true);
    try {
      await api.post(`/admin/approvals/users/${userId}/action`, { action });
      const r = await api.get(`/admin/compliance/users/${userId}/dossier`);
      setData(r?.data);
      onAction?.();
    } catch (e) {
      alert(e?.message || "Approval action failed");
    } finally {
      setBusy(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="card max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 relative">
        <button type="button" className="absolute top-4 right-4 btn-ghost !p-2" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading compliance dossier…</p>
        ) : !data ? (
          <p>Could not load dossier.</p>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold pr-10">{data.user?.name}</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>{data.user?.email} · {data.user?.role}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className={`badge ${data.user?.approval_status === "approved" ? "text-green-400" : "text-amber-400"}`}>
                Account: {data.user?.approval_status || "pending"}
              </span>
              <span className={`badge ${data.user?.agreement_complete ? "text-green-400" : "text-amber-400"}`}>
                Agreements: {data.user?.agreement_complete ? "complete" : "incomplete"}
              </span>
            </div>

            {(data.user?.role === "delivery" || data.user?.role === "driver" || data.user?.role === "vendor" || data.user?.role === "restaurant") && (
              <section className="mt-6 p-4 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <h3 className="font-bold mb-3">Partner approval</h3>
                <div className="flex flex-wrap gap-2">
                  {data.user?.approval_status !== "approved" ? (
                    <>
                      <button className="btn-primary !py-2 text-sm" disabled={busy} onClick={() => setApproval("approve")}>
                        Approve partner
                      </button>
                      <button className="btn-ghost !py-2 text-sm" disabled={busy} onClick={() => setApproval("request_info")}>
                        Request info
                      </button>
                      <button className="btn-ghost !py-2 text-sm text-red-400" disabled={busy} onClick={() => setApproval("reject")}>
                        Reject
                      </button>
                    </>
                  ) : (
                    <button className="btn-ghost !py-2 text-sm text-amber-400" disabled={busy} onClick={() => setApproval("revoke")}>
                      Revoke approval
                    </button>
                  )}
                </div>
              </section>
            )}

            <section className="mt-6">
              <h3 className="font-bold flex items-center gap-2"><FileText size={18} /> Signed Agreements</h3>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {(data.agreements || []).map((a) => (
                  <div key={a.type} className="p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{a.title}</span>
                      {a.signed ? (
                        <span className="text-green-400 flex items-center gap-1"><Check size={14} /> v{a.acceptance?.agreement_version || "1.0"}</span>
                      ) : (
                        <span className="text-amber-400">Not signed</span>
                      )}
                    </div>
                    {a.acceptance && (
                      <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                        <div>Signature: <strong>{a.acceptance.signature || a.acceptance.typed_name}</strong></div>
                        <div>Signed: {new Date(a.acceptance.accepted_at).toLocaleString()}</div>
                        <div>IP: {a.acceptance.ip_address || "—"} · {a.acceptance.device || "—"} · {a.acceptance.browser || "—"}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-6">
              <h3 className="font-bold flex items-center gap-2"><Download size={18} /> Uploaded Documents</h3>
              <div className="mt-3 space-y-2">
                {[...(data.documents?.driver || []), ...(data.documents?.restaurant || [])].length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>No documents uploaded yet.</p>
                ) : (
                  <>
                    {(data.documents?.driver || []).map((d) => (
                      <DocRow key={d.document_id} doc={d} onView={() => viewDoc(d.document_id, "driver")} />
                    ))}
                    {(data.documents?.restaurant || []).map((d) => (
                      <DocRow key={d.document_id} doc={d} onView={() => viewDoc(d.document_id, "restaurant")} />
                    ))}
                  </>
                )}
              </div>
            </section>

            {data.user?.role === "delivery" && (
              <section className="mt-6">
                <h3 className="font-bold flex items-center gap-2"><Shield size={18} /> Background Check</h3>
                <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                  <p className="text-sm">Status: <strong>{data.background_check?.status || "not started"}</strong></p>
                  {data.background_check?.mvr_status && (
                    <p className="text-sm mt-1">MVR: {data.background_check.mvr_status}</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button className="btn-primary !py-1 text-sm" disabled={busy} onClick={() => setBgStatus("approved")}>Pass BG Check</button>
                    <button className="btn-ghost !py-1 text-sm text-red-400" disabled={busy} onClick={() => setBgStatus("rejected")}>Fail BG Check</button>
                  </div>
                </div>
              </section>
            )}

            {data.tax && (
              <section className="mt-6">
                <h3 className="font-bold">Tax / W-9</h3>
                <div className="mt-2 text-sm p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                  <p>Legal name: {data.tax.legal_name}</p>
                  <p>Tax ID: {data.tax.masked_id || "On file"}</p>
                  <p>Classification: {data.tax.tax_classification}</p>
                  <p>Signed: {data.tax.w9_signed_at ? new Date(data.tax.w9_signed_at).toLocaleString() : "—"}</p>
                </div>
              </section>
            )}

            {data.merchant_verification && (
              <section className="mt-6 p-4 rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <h3 className="font-bold mb-3">Merchant verification</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div><span style={{ color: "var(--muted)" }}>Category:</span> <strong>{data.merchant_verification.merchant_category_slug || "—"}</strong></div>
                  <div><span style={{ color: "var(--muted)" }}>Status:</span> <strong>{data.merchant_verification.verification_status || "pending"}</strong></div>
                  <div><span style={{ color: "var(--muted)" }}>Business:</span> {data.merchant_verification.business_name || "—"}</div>
                  <div><span style={{ color: "var(--muted)" }}>Owner:</span> {data.merchant_verification.owner_name || "—"}</div>
                  <div><span style={{ color: "var(--muted)" }}>License #:</span> {data.merchant_verification.business_license_number || "—"}</div>
                  <div><span style={{ color: "var(--muted)" }}>State license:</span> {data.merchant_verification.state_license_number || "—"}</div>
                  <div><span style={{ color: "var(--muted)" }}>Expires:</span> {data.merchant_verification.license_expiration_date || "—"}</div>
                  <div>
                    <span style={{ color: "var(--muted)" }}>Delivery agreement:</span>{" "}
                    {data.merchant_verification.delivery_agreement_accepted ? "✓" : "—"}
                  </div>
                  <div>
                    <span style={{ color: "var(--muted)" }}>Age-restricted confirmed:</span>{" "}
                    {data.merchant_verification.age_restricted_confirmed ? "✓" : "—"}
                  </div>
                </div>
              </section>
            )}

            {data.onboarding && !data.merchant_verification && (
              <section className="mt-6">
                <h3 className="font-bold">Onboarding Progress</h3>
                <pre className="mt-2 text-xs p-3 rounded-lg overflow-x-auto" style={{ background: "var(--surface-2)" }}>
                  {JSON.stringify(data.onboarding, null, 2)}
                </pre>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DocRow({ doc, onView }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
      <div>
        <div className="font-medium">{doc.document_type?.replace(/_/g, " ")}</div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {doc.file_name || doc.file_key} · {doc.status}
          {doc.expires_at && ` · expires ${doc.expires_at}`}
        </div>
      </div>
      {doc.storage_path && (
        <button type="button" className="btn-ghost !py-1 text-sm inline-flex items-center gap-1" onClick={onView}>
          <ExternalLink size={14} /> View
        </button>
      )}
    </div>
  );
}
