"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CreditCard, Check, AlertCircle, ExternalLink } from "lucide-react";

export default function StripeConnectSetup({ entityType = "driver", onComplete }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/onboarding/stripe-connect/status", { params: { entity_type: entityType } });
      setStatus(r?.data || null);
      if (r?.data?.complete) onComplete?.(r.data);
    } catch {
      setStatus({ complete: false, connected: false });
    } finally {
      setLoading(false);
    }
  }, [entityType, onComplete]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const startOnboarding = async () => {
    setBusy(true);
    try {
      const returnUrl = typeof window !== "undefined"
        ? `${window.location.origin}${entityType === "driver" ? "/driver/onboarding" : "/restaurant/onboarding"}?step=3&stripe=return`
        : undefined;
      const r = await api.post("/onboarding/stripe-connect", {
        entity_type: entityType,
        return_url: returnUrl,
      });
      if (r?.data?.onboarding_url) {
        window.location.href = r.data.onboarding_url;
      } else if (r?.data?.complete) {
        await loadStatus();
      }
    } catch (e) {
      alert(e?.message || "Could not start Stripe Connect setup");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Checking payout setup…</p>;
  }

  const complete = status?.complete;
  const connected = status?.connected;
  const bankVerified = status?.bank_verified;

  return (
    <div className="rounded-lg p-5 space-y-4" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-center gap-3">
        <CreditCard size={24} style={{ color: "var(--primary)" }} />
        <div>
          <h3 className="font-bold">Stripe Connect Payout Setup</h3>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Connect your bank account to receive {entityType === "driver" ? "delivery" : "order"} payouts.
          </p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <StatusRow label="Stripe account" ok={connected} detail={status?.account_id ? `…${status.account_id.slice(-8)}` : "Not connected"} />
        <StatusRow label="Onboarding complete" ok={complete} detail={complete ? "Verified" : "Incomplete"} />
        <StatusRow label="Bank verification" ok={bankVerified} detail={bankVerified ? "Verified" : "Pending"} />
      </div>

      {!complete && (
        <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={busy} onClick={startOnboarding}>
          <ExternalLink size={16} />
          {busy ? "Redirecting…" : connected ? "Complete Stripe setup" : "Set up payouts with Stripe"}
        </button>
      )}

      {complete && (
        <p className="text-sm text-green-400 flex items-center gap-1">
          <Check size={16} /> Payout setup complete
        </p>
      )}

      {status?.demo_mode && (
        <p className="text-xs flex items-center gap-1 text-amber-400">
          <AlertCircle size={14} /> Demo mode — Stripe Connect simulated until API keys are configured.
        </p>
      )}
    </div>
  );
}

function StatusRow({ label, ok, detail }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className={`flex items-center gap-1 ${ok ? "text-green-400" : "text-amber-400"}`}>
        {ok ? <Check size={14} /> : <AlertCircle size={14} />}
        {detail}
      </span>
    </div>
  );
}
