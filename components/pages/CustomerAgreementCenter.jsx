"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, Check, Clock, FileText, History } from "lucide-react";

function clientMeta() {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  return {
    user_agent: ua,
    browser: /Chrome|Firefox|Safari|Edge/.exec(ua)?.[0] || "unknown",
    device: /Mobile|Android|iPhone/i.test(ua) ? "mobile" : "desktop",
    ip_address: null,
  };
}

function AgreementCard({ agreement, checks, signatures, onToggle, onSig }) {
  const a = agreement;
  return (
    <div className="card p-5" data-testid={`agreement-${a.type}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{a.title}</h3>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface-2)" }}>v{a.version}</span>
            {a.accepted && <span className="text-xs text-green-400 flex items-center gap-1"><Check size={12} /> Signed</span>}
            {a.needs_resign && <span className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> Re-sign required</span>}
          </div>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{a.body}</p>
          {a.acceptance && (
            <div className="mt-3 text-xs p-3 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              <div className="flex items-center gap-1"><Clock size={12} /> Signed {new Date(a.acceptance.accepted_at).toLocaleString()}</div>
              <div className="mt-1">Signature: <strong style={{ color: "var(--text)" }}>{a.acceptance.signature || a.acceptance.typed_name}</strong></div>
              {a.acceptance.ip_address && <div className="mt-1">IP: {a.acceptance.ip_address} · {a.acceptance.device} · {a.acceptance.browser}</div>}
            </div>
          )}
          {a.needs_resign && a.previous_acceptance && (
            <p className="text-xs mt-2 text-amber-400">
              You previously signed v{a.previous_acceptance.agreement_version}. Please review and accept v{a.version}.
            </p>
          )}
        </div>
        {a.required && !a.accepted && <span className="text-xs font-bold text-amber-400 shrink-0">Required</span>}
      </div>
      {!a.accepted && (
        <div className="mt-4 space-y-3">
          {a.kind === "signature" && (
            <input
              className="input-field w-full"
              placeholder="Type your full legal name"
              value={signatures[a.type] || ""}
              onChange={(e) => onSig(a.type, e.target.value)}
              data-testid={`signature-${a.type}`}
            />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(checks[a.type])} onChange={() => onToggle(a.type)} data-testid={`consent-${a.type}`} />
            I agree to the {a.title} (v{a.version})
          </label>
        </div>
      )}
    </div>
  );
}

export default function CustomerAgreementCenter() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [agreements, setAgreements] = useState([]);
  const [history, setHistory] = useState([]);
  const [checks, setChecks] = useState({});
  const [signatures, setSignatures] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get("/agreements/me"),
      api.get("/agreements/history"),
    ]).then(([me, hist]) => {
      const list = Array.isArray(me?.data) ? me.data : [];
      setAgreements(list);
      setHistory(Array.isArray(hist?.data) ? hist.data : []);
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
      const stored = sessionStorage.getItem("auth_redirect");
      sessionStorage.removeItem("auth_redirect");
      router.replace(stored || "/");
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Customer Agreement Center</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Review and accept required policies before placing orders. Agreements are versioned — you may be asked to re-sign after updates.
            </p>
          </div>
          <button type="button" className="btn-ghost !py-2 text-sm inline-flex items-center gap-1" onClick={() => setShowHistory((v) => !v)}>
            <History size={14} /> {showHistory ? "Hide" : "History"}
          </button>
        </div>

        {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

        {pending.length > 0 && (
          <div className="mt-4 p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
            <FileText size={16} className="text-amber-400 shrink-0" />
            <span>{pending.length} agreement{pending.length !== 1 ? "s" : ""} require{pending.length === 1 ? "s" : ""} your acceptance</span>
          </div>
        )}

        <div className="mt-8 space-y-4">
          {agreements.map((a) => (
            <AgreementCard
              key={a.type}
              agreement={a}
              checks={checks}
              signatures={signatures}
              onToggle={(type) => setChecks((prev) => ({ ...prev, [type]: !prev[type] }))}
              onSig={(type, val) => setSignatures((prev) => ({ ...prev, [type]: val }))}
            />
          ))}
        </div>

        {showHistory && history.length > 0 && (
          <div className="mt-8">
            <h2 className="font-bold mb-3">Agreement History</h2>
            <div className="card overflow-hidden">
              <table className="w-full text-xs">
                <thead style={{ background: "var(--surface-2)" }}>
                  <tr>
                    <th className="text-left p-3">Agreement</th>
                    <th className="text-left p-3">Version</th>
                    <th className="text-left p-3">Signed</th>
                    <th className="text-left p-3">Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.acceptance_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-3">{h.agreement_type?.replace(/_/g, " ")}</td>
                      <td className="p-3">{h.agreement_version}</td>
                      <td className="p-3">{new Date(h.accepted_at).toLocaleString()}</td>
                      <td className="p-3 font-mono">{h.signature || h.typed_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <button className="btn-primary mt-8" disabled={!allReady || busy} onClick={submitAll} data-testid="submit-agreements">
            {busy ? "Saving…" : "Accept all agreements"}
          </button>
        )}
        {pending.length === 0 && agreements.length > 0 && (
          <div className="mt-8">
            <p className="text-green-400 flex items-center gap-2"><Check size={18} /> All agreements are current.</p>
            <button type="button" className="btn-ghost mt-4" onClick={() => router.push("/")}>Continue browsing</button>
          </div>
        )}
      </div>
    </div>
  );
}
