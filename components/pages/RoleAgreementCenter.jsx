"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { collectClientMeta } from "@/lib/compliance/clientMeta";
import AgreementSigningCard from "@/components/compliance/AgreementSigningCard";
import { isSignatureComplete } from "@/components/compliance/AgreementSignaturePanel";

export default function RoleAgreementCenter({ roleLabel, onComplete = null, stayOnComplete = false }) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [agreements, setAgreements] = useState([]);
  const [checks, setChecks] = useState({});
  const [sigByType, setSigByType] = useState({});
  const [scrollByType, setScrollByType] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api.get("/agreements/me").then((r) => {
      const list = Array.isArray(r?.data) ? r.data : [];
      setAgreements(list);
      const c = {};
      const s = {};
      const sc = {};
      list.forEach((a) => {
        if (a.accepted) c[a.type] = true;
        if (a.acceptance?.typed_name) s[a.type] = { typed_name: a.acceptance.typed_name, initials: a.acceptance.initials, signature_method: a.acceptance.signature_method || "typed" };
        sc[a.type] = Boolean(a.accepted);
      });
      setChecks(c);
      setSigByType(s);
      setScrollByType(sc);
    }).catch((e) => setError(e?.message || "Failed to load agreements"));
  }, [user]);

  const pending = agreements.filter((a) => a.required && !a.accepted);
  const allReady = pending.every((a) => {
    if (!checks[a.type] || !scrollByType[a.type]) return false;
    return isSignatureComplete(sigByType[a.type], a.kind);
  });

  const downloadPdf = async (acceptanceId) => {
    try {
      const r = await api.get(`/agreements/${acceptanceId}/pdf`);
      if (r?.data?.url) window.open(r.data.url, "_blank");
    } catch (e) {
      alert(e?.message || "PDF unavailable");
    }
  };

  const submitAll = async () => {
    setBusy(true);
    setError("");
    try {
      const meta = await collectClientMeta();
      const batch = pending.map((a) => ({
        agreement_type: a.type,
        consent_checkbox: Boolean(checks[a.type]),
        scroll_read: Boolean(scrollByType[a.type]),
        ...sigByType[a.type],
        typed_name: sigByType[a.type]?.typed_name || user?.name || "",
        ...meta,
      }));
      await api.post("/agreements/batch-accept", { agreements: batch, ...meta });
      await refresh();
      if (stayOnComplete && onComplete) {
        onComplete();
        return;
      }
      const statusRes = await api.get("/auth/compliance-status");
      const status = statusRes?.data;
      if (status?.can_access_dashboard) {
        router.replace(user?.role === "vendor" ? "/restaurant/dashboard" : "/driver/dashboard");
      } else {
        router.replace("/pending-approval");
      }
    } catch (e) {
      setError(e?.message || "Failed to save agreements");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-bold">{roleLabel} Agreement Center</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>
          Scroll to read each agreement, sign with draw/type/upload, and provide initials. Signed PDFs are archived automatically.
        </p>
        {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

        <div className="mt-8 space-y-4">
          {agreements.map((a) => (
            <AgreementSigningCard
              key={a.type}
              agreement={a}
              sig={sigByType[a.type] || {}}
              onSigChange={(sig) => setSigByType((prev) => ({ ...prev, [a.type]: sig }))}
              scrolled={scrollByType[a.type]}
              onScrolled={() => setScrollByType((prev) => ({ ...prev, [a.type]: true }))}
              checked={checks[a.type]}
              onToggle={() => setChecks((prev) => ({ ...prev, [a.type]: !prev[a.type] }))}
              onDownloadPdf={a.acceptance?.acceptance_id ? () => downloadPdf(a.acceptance.acceptance_id) : undefined}
            />
          ))}
        </div>

        {pending.length > 0 && (
          <button className="btn-primary mt-8" disabled={!allReady || busy} onClick={submitAll} data-testid="submit-agreements">
            {busy ? "Saving…" : "Submit all agreements"}
          </button>
        )}
        {pending.length === 0 && agreements.length > 0 && (
          <p className="mt-8 text-green-400">All agreements complete.</p>
        )}
      </div>
    </div>
  );
}
