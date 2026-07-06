"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, RefreshCw, Shield } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";

const STATUS_ROWS = [
  { key: "charges_enabled", label: "Charges enabled" },
  { key: "payouts_enabled", label: "Payouts enabled" },
  { key: "details_submitted", label: "Details submitted" },
  { key: "identity_verified", label: "Identity verified" },
];

export default function PayoutSetupPanel({ entityType = "driver", compact = false }) {
  const [status, setStatus] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const statusPath = entityType === "restaurant" ? "/connect/restaurant/status" : "/connect/driver/status";
  const onboardPath = entityType === "restaurant" ? "/connect/restaurant/onboard" : "/connect/driver/onboard";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [st, notes] = await Promise.all([
        api.get(statusPath),
        api.get("/connect/notifications"),
      ]);
      setStatus(st?.data || null);
      setAlerts(Array.isArray(notes?.data) ? notes.data.filter((n) => !n.read_at) : []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [statusPath]);

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("stripe") === "return") refresh();
  }, [refresh]);

  const startOnboarding = async () => {
    setBusy(true);
    try {
      const res = await api.post(onboardPath, {
        return_url: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      const url = res?.data?.url;
      if (!url) throw new Error("Stripe onboarding URL unavailable");
      window.location.href = url;
    } catch (e) {
      alert(getApiErrorMessage(e, "Could not start Stripe onboarding"));
    } finally {
      setBusy(false);
    }
  };

  const startReverification = async () => {
    setBusy(true);
    try {
      const res = await api.post("/connect/reverify", {
        return_url: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      const url = res?.data?.url;
      if (!url) throw new Error("Reverification URL unavailable");
      window.location.href = url;
    } catch (e) {
      alert(getApiErrorMessage(e, "Could not start reverification"));
    } finally {
      setBusy(false);
    }
  };

  const payoutReady = Boolean(status?.payout_ready);
  const needsReverify = Boolean(status?.requires_reverification);
  const unreadAlert = alerts.find((a) => a.event_type !== "payout_setup_complete");

  return (
    <div className={compact ? "space-y-4" : "card p-6 space-y-5"}>
      {!compact && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label-eyebrow flex items-center gap-2">
              <CreditCard size={14} /> Stripe Connect payouts
            </div>
            <h2 className="font-display text-xl font-bold mt-1">Payout account</h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {entityType === "restaurant"
                ? "Complete payout setup to accept orders and receive deposits."
                : "Complete payout setup to receive delivery earnings."}
            </p>
          </div>
          <button type="button" className="btn-ghost !p-2" onClick={refresh} disabled={loading} title="Refresh status">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      )}

      {unreadAlert && (
        <div
          className="rounded-xl p-4 flex items-start gap-3 text-sm"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <AlertTriangle size={18} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <div className="font-bold">{unreadAlert.title}</div>
            <div style={{ color: "var(--muted)" }}>{unreadAlert.body}</div>
          </div>
        </div>
      )}

      {loading && !status ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>Loading Stripe status…</div>
      ) : (
        <>
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              background: payoutReady ? "rgba(34,197,94,0.08)" : "rgba(234,179,8,0.08)",
              border: `1px solid ${payoutReady ? "rgba(34,197,94,0.25)" : "rgba(234,179,8,0.25)"}`,
            }}
          >
            {payoutReady ? <CheckCircle2 size={22} style={{ color: "#22c55e" }} /> : <Shield size={22} style={{ color: "#eab308" }} />}
            <div>
              <div className="font-bold">{payoutReady ? "Payouts active" : needsReverify ? "Reverification required" : "Payout setup incomplete"}</div>
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                {payoutReady
                  ? "Your account is ready to receive payouts."
                  : needsReverify
                    ? "Stripe needs updated information before payouts can continue."
                    : "Finish Stripe onboarding to unlock payouts."}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {STATUS_ROWS.map(({ key, label }) => (
              <div key={key} className="rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)" }}>
                <div style={{ color: "var(--muted)" }}>{label}</div>
                <div className="font-bold mt-1">{status?.[key] ? "Yes" : "No"}</div>
              </div>
            ))}
          </div>

          {status?.requirements_due?.length > 0 && (
            <div className="text-sm">
              <div className="font-bold mb-1">Outstanding requirements</div>
              <ul className="list-disc pl-5 space-y-1" style={{ color: "var(--muted)" }}>
                {status.requirements_due.slice(0, 6).map((req) => (
                  <li key={req}>{req.replace(/_/g, " ")}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!payoutReady && (
              <button type="button" className="btn-primary" disabled={busy} onClick={startOnboarding}>
                {busy ? "Opening Stripe…" : status?.stripe_account_id ? "Continue Stripe setup" : "Set up payouts with Stripe"}
              </button>
            )}
            {needsReverify && (
              <button type="button" className="btn-primary" disabled={busy} onClick={startReverification}>
                {busy ? "Opening Stripe…" : "Complete reverification"}
              </button>
            )}
            {status?.stripe_account_id && (
              <span className="text-xs self-center" style={{ color: "var(--muted)" }}>
                Account {status.stripe_account_id}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
