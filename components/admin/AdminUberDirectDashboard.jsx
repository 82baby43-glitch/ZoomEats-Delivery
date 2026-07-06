"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, Truck, CheckCircle2, AlertCircle } from "lucide-react";
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

export default function AdminUberDirectDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/uber-direct");
      setData(r?.data && typeof r.data === "object" ? r.data : null);
      setError(false);
    } catch (e) {
      logClientError("admin.uber-direct", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const testConnection = async () => {
    setTesting(true);
    try {
      const r = await api.post("/admin/uber-direct/test");
      const ok = Boolean(r?.data?.ok);
      setData((prev) => (prev ? { ...prev, auth: { ok, error: r?.data?.error } } : prev));
    } catch (e) {
      logClientError("admin.uber-direct.test", e);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton label="Loading Uber Direct…" rows={4} />;
  }

  if (error || !data) {
    return <ErrorState title="Could not load Uber Direct" onRetry={load} />;
  }

  const stats = data.stats || {};
  const deliveries = Array.isArray(data.deliveries) ? data.deliveries : [];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Truck size={20} style={{ color: "var(--primary)" }} />
                <h2 className="font-display text-xl font-bold">Connection</h2>
              </div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Uber Direct dispatches couriers when no internal ZoomEats drivers are available.
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
            <StatusPill ok={data.configured} label={data.configured ? "Configured" : "Not configured"} />
            <StatusPill ok={data.enabled} label={data.enabled ? "Enabled" : "Disabled"} />
            <StatusPill ok={data.auth?.ok} label={data.auth?.ok ? "Auth OK" : "Auth failed"} />
            {data.preferred && <span className="badge">Preferred over internal drivers</span>}
          </div>

          {data.customer_id && (
            <div className="mt-4 text-sm grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ color: "var(--muted)" }}>
              <div>Customer ID: <span className="font-mono">{data.customer_id}</span></div>
              <div>Client ID: <span className="font-mono">{data.client_id}</span></div>
            </div>
          )}

          {!data.auth?.ok && data.auth?.error && (
            <p className="mt-4 text-sm text-red-400">{String(data.auth.error)}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={data.links?.dashboard || "https://direct.uber.com"}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              Open Uber Direct Dashboard <ExternalLink size={14} />
            </a>
            <a
              href={data.links?.docs || "https://developer.uber.com/docs/deliveries"}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost inline-flex items-center gap-2 text-sm"
            >
              API Docs <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-lg font-bold mb-4">Delivery stats</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              ["Today", stats.today ?? 0],
              ["Active", stats.active ?? 0],
              ["Completed", stats.completed ?? 0],
              ["Total orders", stats.total_orders ?? 0],
            ].map(([label, val]) => (
              <div key={label} className="text-center p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                <div className="text-2xl font-bold">{val}</div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="font-display text-xl font-bold">Recent Uber deliveries</h2>
          <button type="button" className="btn-ghost !py-2 text-sm inline-flex items-center gap-2" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {deliveries.length === 0 ? (
          <EmptyState
            title="No Uber deliveries yet"
            description="When paid orders fall back to Uber Direct, they will appear here with tracking links."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <th className="text-left p-3">Order</th>
                  <th className="text-left p-3">Restaurant</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Tracking</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.delivery_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-3 font-mono">
                      <Link href={`/orders/${d.order_id}`} className="hover:underline">
                        #{safeOrderId(d.order_id)}
                      </Link>
                    </td>
                    <td className="p-3">{d.restaurant_name || "—"}</td>
                    <td className="p-3">{d.customer_name || "—"}</td>
                    <td className="p-3 text-right font-bold">
                      {d.total != null ? `$${formatMoney(d.total)}` : "—"}
                    </td>
                    <td className="p-3">
                      <span className={`badge ${d.active ? "text-amber-400" : "text-green-400"}`}>
                        {d.order_status || d.status || "—"}
                      </span>
                    </td>
                    <td className="p-3">
                      {d.tracking_url ? (
                        <a
                          href={d.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm hover:underline"
                          style={{ color: "var(--primary)" }}
                        >
                          Track <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
