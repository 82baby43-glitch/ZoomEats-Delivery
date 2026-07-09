"use client";

import { AlertTriangle, Check } from "lucide-react";
import ScrollToRead from "@/components/compliance/ScrollToRead";
import AgreementSignaturePanel, { isSignatureComplete } from "@/components/compliance/AgreementSignaturePanel";

export default function AgreementSigningCard({
  agreement,
  sig,
  onSigChange,
  scrolled,
  onScrolled,
  checked,
  onToggle,
  onDownloadPdf,
}) {
  const a = agreement;
  const canSign = scrolled && (a.kind === "checkbox" ? (sig?.initials || "").length >= 2 : isSignatureComplete(sig, a.kind));

  return (
    <div className="card p-5" data-testid={`agreement-${a.type}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{a.title}</h3>
            {a.version && <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface-2)" }}>v{a.version}</span>}
            {a.accepted && <span className="text-xs text-green-400 flex items-center gap-1"><Check size={12} /> Signed</span>}
            {a.needs_resign && <span className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> Re-sign required</span>}
          </div>

          {!a.accepted ? (
            <div className="mt-3">
              <ScrollToRead onRead={onScrolled}>
                <p>{a.body}</p>
              </ScrollToRead>
            </div>
          ) : (
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{a.body}</p>
          )}

          {a.acceptance && (
            <div className="mt-3 text-xs p-3 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              <div>Signed {new Date(a.acceptance.accepted_at).toLocaleString()} · v{a.acceptance.agreement_version}</div>
              <div className="mt-1">Method: {a.acceptance.signature_method || "typed"} · Initials: {a.acceptance.initials || "—"}</div>
              <div className="mt-1">IP: {a.acceptance.ip_address || "—"} · {a.acceptance.device} · {a.acceptance.browser}</div>
              {a.acceptance.signed_pdf_path && onDownloadPdf && (
                <button
                  type="button"
                  className="text-xs mt-2 underline"
                  style={{ color: "var(--primary)" }}
                  onClick={onDownloadPdf}
                >
                  Download signed PDF
                </button>
              )}
            </div>
          )}
        </div>
        {a.required && !a.accepted && <span className="text-xs font-bold text-amber-400 shrink-0">Required</span>}
      </div>

      {!a.accepted && (
        <div className="mt-4 space-y-3">
          {a.kind === "signature" && (
            <AgreementSignaturePanel
              value={sig}
              onChange={onSigChange}
              disabled={!scrolled}
            />
          )}
          {a.kind === "checkbox" && scrolled && (
            <div>
              <label className="label text-xs">Initials</label>
              <input
                className="input-field w-24 uppercase"
                placeholder="AB"
                maxLength={4}
                value={sig?.initials || ""}
                onChange={(e) => onSigChange?.({ ...sig, initials: e.target.value.toUpperCase(), signature_method: "checkbox" })}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(checked)}
              disabled={!canSign}
              onChange={onToggle}
              data-testid={`consent-${a.type}`}
            />
            I agree to the {a.title} (v{a.version || "1.0"})
          </label>
          {!scrolled && <p className="text-xs text-amber-400">Read the full agreement before signing.</p>}
        </div>
      )}
    </div>
  );
}
