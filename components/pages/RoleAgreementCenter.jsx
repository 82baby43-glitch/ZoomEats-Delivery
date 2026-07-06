"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, Check, Clock } from "lucide-react";

function clientMeta() {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  return {
    user_agent: ua,
    browser: /Chrome|Firefox|Safari|Edge/.exec(ua)?.[0] || "unknown",
    device: /Mobile|Android|iPhone/i.test(ua) ? "mobile" : "desktop",
  };
}

export default function RoleAgreementCenter({ roleLabel }) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [agreements, setAgreements] = useState([]);
  const [checks, setChecks] = useState({});
  const [signatures, setSignatures] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api.get("/agreements/me").then((r) => {
      const list = Array.isArray(r?.data) ? r.data : [];
      setAgreements(list);
      const c = {};
      const s = {};
      list.forEach((a) => {
        if (a.accepted) c[a.type] = true;
        if (a.acceptance?.typed_name) s[a.type] = a.acceptance.typed_name;
      });
      setChecks(c);
      setSignatures(s);
    }).catch((e) => setError(e?.message || "Failed to load agreements"));
  }, [user]);

  const toggle = (type) => setChecks((prev) => ({ ...prev, [type]: !prev[type] }));
  const setSig = (type, val) => setSignatures((prev) => ({ ...prev, [type]: val }));

  const pending = agreements.filter((a) => a.required && !a.accepted);
  const allReady = pending.every((a) => {
    if (a.kind === "checkbox") return checks[a.type];
    return checks[a.type] && (signatures[a.type] || "").trim().length > 1;
  });

  const submitAll = async () => {
    setBusy(true);
    setError("");
    try {
      const meta = clientMeta();
      const batch = pending.map((a) => ({
        agreement_type: a.type,
        typed_name: signatures[a.type] || user?.name || "",
        consent_checkbox: Boolean(checks[a.type]),
        ...meta,
      }));
      await api.post("/agreements/batch-accept", { agreements: batch, ...meta });
      await refresh();
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
          Accept all required agreements before you can access your dashboard.
        </p>
        {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

        <div className="mt-8 space-y-4">
          {agreements.map((a) => (
            <div key={a.type} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{a.title}</h3>
                    {a.version && <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface-2)" }}>v{a.version}</span>}
                    {a.needs_resign && <span className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> Re-sign</span>}
                  </div>
                  <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{a.body}</p>
                  {a.accepted && a.acceptance && (
                    <p className="text-xs mt-2 text-green-400 flex items-center gap-1">
                      <Check size={12} /> Accepted · <Clock size={12} /> {new Date(a.acceptance.accepted_at).toLocaleString()}
                    </p>
                  )}
                </div>
                {a.required && <span className="text-xs font-bold text-amber-400">Required</span>}
              </div>
              {!a.accepted && (
                <div className="mt-4 space-y-3">
                  {a.kind === "signature" && (
                    <input
                      className="input-field w-full"
                      placeholder="Type your full legal name"
                      value={signatures[a.type] || ""}
                      onChange={(e) => setSig(a.type, e.target.value)}
                    />
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(checks[a.type])} onChange={() => toggle(a.type)} />
                    I agree to the {a.title}
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        {pending.length > 0 && (
          <button className="btn-primary mt-8" disabled={!allReady || busy} onClick={submitAll}>
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
