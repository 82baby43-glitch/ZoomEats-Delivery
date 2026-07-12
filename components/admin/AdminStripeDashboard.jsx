"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, CreditCard, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney, safeOrderId } from "@/lib/safeData";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui/PageStates";
import { logClientError } from "@/lib/clientErrorLog";

function StatusPill({ ok, label }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
      style={{
        background: ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
        color: ok ? "#4ade80" : "#f87171",
      }}
    >
      {ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {label}
    </span>
  );
}

function paymentBadgeClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "text-green-400";
  if (["failed", "canceled", "cancelled"].includes(s)) return "text-red-400";
  return "text-amber-400";
}

export default function AdminStripeDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/stripe");
      setData(r?.data && typeof r.data === "object" ? r.data : null);
      setError(false);
    } catch (e) {
      logClientError("admin.stripe", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const testConnection = async () => {
    setTesting(true);
    try {
      const r = await api.post("/admin/stripe/test");
      const ok = Boolean(r?.data?.ok);
      setData((prev) => (prev ? { ...prev, auth: { ok, error: r?.data?.error, mode: r?.data?.mode } } : prev));
    } catch (e) {
      logClientError("admin.stripe.test", e);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton label="Loading Stripe…" rows={4} />;
  }

  if (error || !data) {
    return <ErrorState title="Could not load Stripe" onRetry={load} />;
  }

  const stats = data.stats || {};
  const orders = Array.isArray(data.orders) ? data.orders : [];
  const errors = Array.isArray(data.payment_errors) ? data.payment_errors : [];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={20} style={{ color: "var(--primary)" }} />
                <h2 className="font-display text-xl font-bold">Connection</h2>
              </div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Monitor Stripe checkout, platform orders, and payment health.
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost !py-2 inline-flex items-center gap-2 text-sm"
              onClick={testConnection}
              disabled={testing}
            >
              <RefreshCw size={16} className={testing ? "animate-spin" : ""} />
              Test
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <StatusPill ok={data.configured} label={data.configured ? "API key set" : "Not configured"} />
            <StatusPill ok={data.webhook_registered} label={data.webhook_registered ? "Webhook registered" : "Webhook not registered"} />
            <StatusPill ok={data.webhook_configured} label={data.webhook_configured ? "Webhook secret" : "No webhook secret"} />
            <StatusPill ok={data.auth?.ok} label={data.auth?.ok ? `Connected (${data.auth.mode || "test"})` : "Auth failed"} />
          </div>

          {data.webhook_registration_detail && (
            <div className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
              Stripe webhook: {data.webhook_registration_detail}
            </div>
          )}

          {(data.api_key_preview || data.publishable_key_preview) && (
            <div className="mt-4 text-sm grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ color: "var(--muted)" }}>
              {data.api_key_preview && <div>Secret key: <span className="font-mono">{data.api_key_preview}</span></div>}
              {data.publishable_key_preview && <div>Publishable: <span className="font-mono">{data.publishable_key_preview}</span></div>}
            </div>
          )}

          {data.webhook_url && (
            <div className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
              Webhook URL: <span className="font-mono break-all">{data.webhook_url}</span>
            </div>
          )}

          {!data.auth?.ok && data.auth?.error && (
            <p className="mt-4 text-sm text-red-400">{String(data.auth.error)}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={data.links?.dashboard || "https://dashboard.stripe.com"}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              Open Stripe Dashboard <ExternalLink size={14} />
            </a>
            <a
              href={data.links?.payments || "https://dashboard.stripe.com/payments"}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost inline-flex items-center gap-2 text-sm"
            >
              Payments <ExternalLink size={14} />
            </a>
            <a
              href={data.links?.webhooks || "https://dashboard.stripe.com/webhooks"}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost inline-flex items-center gap-2 text-sm"
            >
              Webhooks <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-lg font-bold mb-4">Platform revenue</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              ["Today", `$${formatMoney(stats.today_revenue ?? 0)}`],
              ["Today orders", stats.today_paid_orders ?? 0],
              ["Total revenue", `$${formatMoney(stats.total_revenue ?? 0)}`],
              ["Paid orders", stats.total_paid_orders ?? 0],
              ["Pending", stats.pending_payments ?? 0],
              ["Failed txns", stats.failed_transactions ?? 0],
            ].map(([label, val]) => (
              <div key={label} className="text-center p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                <div className="text-xl font-bold">{val}</div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="font-display text-xl font-bold">Platform orders</h2>
          <button type="button" className="btn-ghost !py-2 text-sm inline-flex items-center gap-2" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {orders.length === 0 ? (
          <EmptyState title="No orders yet" description="Orders placed through ZoomEats will appear here with payment status." />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <th className="text-left p-3">Order</th>
                  <th className="text-left p-3">Restaurant</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-left p-3">Payment</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Session</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-3 font-mono">
                      <Link href={`/orders/${o.order_id}`} className="hover:underline">
                        #{safeOrderId(o.order_id)}
                      </Link>
                    </td>
                    <td className="p-3">{o.restaurant_name || "—"}</td>
                    <td className="p-3">{o.customer_name || "—"}</td>
                    <td className="p-3 text-right font-bold">${formatMoney(o.total)}</td>
                    <td className="p-3">
                      <span className={`badge ${paymentBadgeClass(o.payment_status)}`}>
                        {o.payment_status || "pending"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="badge">{o.order_status || "—"}</span>
                    </td>
                    <td className="p-3 font-mono text-xs" style={{ color: "var(--muted)" }}>
                      {o.session_id || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div>
          <h2 className="font-display text-xl font-bold mb-4">Recent payment errors</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <th className="text-left p-3">Order</th>
                  <th className="text-left p-3">Source</th>
                  <th className="text-left p-3">Error</th>
                  <th className="text-left p-3">When</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.id || `${e.order_id}-${e.created_at}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-3 font-mono">{e.order_id ? `#${safeOrderId(e.order_id)}` : "—"}</td>
                    <td className="p-3">{e.source || "—"}</td>
                    <td className="p-3 text-red-400">{e.error_message || "—"}</td>
                    <td className="p-3" style={{ color: "var(--muted)" }}>
                      {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
