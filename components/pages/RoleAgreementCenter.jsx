"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import LegalDocumentSigning from "@/components/compliance/LegalDocumentSigning";

export default function RoleAgreementCenter({ roleLabel }) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [agreements, setAgreements] = useState([]);
  const [signed, setSigned] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api.get("/agreements/me").then((r) => {
      const list = Array.isArray(r?.data) ? r.data : [];
      setAgreements(list);
      const s = {};
      list.forEach((a) => { if (a.accepted) s[a.type] = true; });
      setSigned(s);
    }).catch((e) => setError(e?.message || "Failed to load agreements"));
  }, [user]);

  const signAgreement = async (signData) => {
    setBusy(signData.agreement_type);
    setError("");
    try {
      await api.post("/agreements/sign-document", signData);
      setSigned((s) => ({ ...s, [signData.agreement_type]: true }));
      await refresh();
    } catch (e) {
      setError(e?.message || "Failed to sign agreement");
    } finally {
      setBusy(null);
    }
  };

  const pending = agreements.filter((a) => a.required && !signed[a.type]);
  const onboardingPath = user?.role === "vendor" ? "/restaurant/onboarding" : "/driver/onboarding";

  useEffect(() => {
    if (pending.length === 0 && agreements.length > 0) {
      api.get("/auth/compliance-status").then((r) => {
        const status = r?.data;
        if (status?.can_access_dashboard) {
          router.replace(user?.role === "vendor" ? "/restaurant/dashboard" : "/driver/dashboard");
        } else if (status?.redirect_to) {
          router.replace(status.redirect_to);
        }
      }).catch(() => {});
    }
  }, [pending.length, agreements.length, user, router]);

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-bold">{roleLabel} Legal Agreements</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>
          Review each document, sign electronically, and submit for approval.
        </p>
        {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

        <div className="mt-8 space-y-6">
          {agreements.map((a) => (
            signed[a.type] ? (
              <div key={a.type} className="card p-4 text-green-400 text-sm">✓ {a.title} — Signed</div>
            ) : (
              <LegalDocumentSigning
                key={a.type}
                agreement={a}
                defaultName={user?.name || ""}
                busy={busy === a.type}
                onSigned={signAgreement}
              />
            )
          ))}
        </div>

        {pending.length > 0 && (
          <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
            {pending.length} agreement{pending.length > 1 ? "s" : ""} remaining.
            Or return to <a href={onboardingPath} className="underline">onboarding wizard</a>.
          </p>
        )}
        {pending.length === 0 && agreements.length > 0 && (
          <p className="mt-8 text-green-400">All agreements signed.</p>
        )}
      </div>
    </div>
  );
}
