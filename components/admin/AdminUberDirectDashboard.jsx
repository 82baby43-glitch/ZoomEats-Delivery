"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, Truck, CheckCircle2, AlertCircle, FlaskConical, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney, safeOrderId } from "@/lib/safeData";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui/PageStates";
import { logClientError } from "@/lib/clientErrorLog";

function Toggle({ checked, onChange, testId }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
      style={{ background: checked ? "var(--primary)" : "var(--surface-2)" }}
      data-testid={testId}
    >
      <span
        className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(1.25rem)" : "translateX(0)" }}
      />
    </button>
  );
}

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

function formatStatusLabel(value) {
  if (!value) return "Unknown";
  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLiveTestResult(result) {
  if (!result || typeof result !== "object") return null;
  if (!result.ok) return result.error || "Test failed";

  if (result.action === "quote") {
    return `Quote OK — $${result.fee_usd || "?"} (${result.quote_id || "no id"}) · ${result.restaurant || "restaurant"} → ${result.dropoff || "dropoff"}`;
  }
  if (result.action === "inspect") {
    if (!result.uber) return "No Uber deliveries to inspect.";
    const mode = result.uber.live_mode ? "live" : "sandbox";
    return `Uber status: ${result.uber.status || "unknown"} (${mode}) · complete: ${String(result.uber.complete)}`;
  }
  if (result.action === "cancel") {
    return `Canceled ${result.delivery_id || "delivery"} — Uber status: ${result.uber_status || "unknown"}`;
  }
  if (result.action === "auth") {
    return result.ok ? "Authentication successful" : result.error || "Authentication failed";
  }
  if (result.action === "save") {
    return result.ok ? "Configuration saved" : result.error || "Save failed";
  }
  if (result.action === "reset") {
    return result.ok ? "Configuration reset" : result.error || "Reset failed";
  }
  return result.ok ? "Test passed" : "Test failed";
}

const defaultForm = {
  enabled: false,
  backup_enabled: false,
  environment: "sandbox",
  client_id: "",
  client_secret: "",
  customer_id: "",
};

export default function AdminUberDirectDashboard() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [liveAction, setLiveAction] = useState(null);
  const [liveResult, setLiveResult] = useState(null);

  const syncFormFromData = useCallback((next) => {
    const config = next?.config || {};
    setForm({
      enabled: Boolean(config.enabled ?? next?.enabled),
      backup_enabled: Boolean(config.backup_enabled ?? next?.backup_enabled),
      environment: config.environment === "production" ? "production" : "sandbox",
      client_id: config.client_id || "",
      client_secret: "",
      customer_id: config.customer_id || "",
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/uber-direct");
      const payload = r?.data && typeof r.data === "object" ? r.data : null;
      setData(payload);
      if (payload) syncFormFromData(payload);
      setError(false);
    } catch (e) {
      logClientError("admin.uber-direct", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [syncFormFromData]);

  useEffect(() => { load(); }, [load]);

  const saveConfiguration = async () => {
    setSaving(true);
    setLiveResult(null);
    try {
      const body = {
        enabled: form.enabled,
        backup_enabled: form.backup_enabled,
        environment: form.environment,
        client_id: form.client_id.trim() || undefined,
        customer_id: form.customer_id.trim() || undefined,
      };
      if (form.client_secret.trim()) {
        body.client_secret = form.client_secret.trim();
      }
      const r = await api.post("/admin/uber-direct/config", body);
      const ok = Boolean(r?.data?.ok);
      if (ok) {
        setData((prev) => (prev ? {
          ...prev,
          enabled: Boolean(r.data.config?.enabled),
          backup_enabled: Boolean(r.data.config?.backup_enabled),
          environment: r.data.config?.environment || prev.environment,
          configured: Boolean(r.data.config?.configured),
          has_client_secret: Boolean(r.data.config?.has_client_secret),
          status: r.data.status || prev.status,
          auth: r.data.auth || prev.auth,
          config: r.data.config || prev.config,
        } : prev));
        setForm((prev) => ({ ...prev, client_secret: "" }));
      }
      setLiveResult({ ok, action: "save", error: r?.data?.error });
    } catch (e) {
      logClientError("admin.uber-direct.config", e);
      setLiveResult({ ok: false, action: "save", error: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const resetConfiguration = async () => {
    if (!window.confirm("Reset Uber Direct configuration? Credentials and settings will be cleared.")) return;
    setResetting(true);
    setLiveResult(null);
    try {
      const r = await api.post("/admin/uber-direct/reset");
      const ok = Boolean(r?.data?.ok);
      if (ok) {
        setForm(defaultForm);
        await load();
      }
      setLiveResult({ ok, action: "reset", error: r?.data?.error });
    } catch (e) {
      logClientError("admin.uber-direct.reset", e);
      setLiveResult({ ok: false, action: "reset", error: String(e) });
    } finally {
      setResetting(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setLiveResult(null);
    try {
      const r = await api.post("/admin/uber-direct/test");
      const ok = Boolean(r?.data?.ok);
      setData((prev) => (prev ? {
        ...prev,
        auth: { ok, error: r?.data?.error },
        status: prev.status ? {
          ...prev.status,
          connection: ok ? "connected" : "authentication_failed",
        } : prev.status,
      } : prev));
      setLiveResult({ ok, action: "auth", error: r?.data?.error });
    } catch (e) {
      logClientError("admin.uber-direct.test", e);
      setLiveResult({ ok: false, action: "auth", error: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const runLiveTest = async (action, deliveryId) => {
    setLiveAction(action);
    setLiveResult(null);
    try {
      const body = { action };
      if (deliveryId) body.delivery_id = deliveryId;
      const r = await api.post("/admin/uber-direct/live-test", body);
      const result = r?.data && typeof r.data === "object" ? r.data : { ok: false, error: "invalid_response" };
      setLiveResult(result);
      if (result.ok && (action === "cancel" || action === "inspect")) {
        await load();
      }
    } catch (e) {
      logClientError("admin.uber-direct.live-test", e);
      setLiveResult({ ok: false, action, error: String(e) });
    } finally {
      setLiveAction(null);
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
  const liveMessage = formatLiveTestResult(liveResult);
  const liveBusy = Boolean(liveAction) || testing || saving || resetting;
  const status = data.status || {};
  const configComplete = status.configuration === "complete";
  const integrationEnabled = status.integration === "enabled";
  const connectionOk = status.connection === "connected";

  return (
    <div className="space-y-8">
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 size={20} style={{ color: "var(--primary)" }} />
          <h2 className="font-display text-xl font-bold">Configuration</h2>
        </div>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          Uber Direct is an optional backup delivery provider. ZoomEats drivers remain the primary delivery network.
        </p>

        <div className="space-y-6">
          <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display font-bold">Uber Direct Integration</h3>
                <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                  Enable Uber Direct as a backup delivery provider when ZoomEats drivers are unavailable.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold" style={{ color: form.enabled ? "#4ade80" : "var(--muted)" }}>
                  {form.enabled ? "ON" : "OFF"}
                </span>
                <Toggle
                  checked={form.enabled}
                  onChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
                  testId="uber-direct-enabled-toggle"
                />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <h3 className="font-display font-bold mb-3">Delivery Mode</h3>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="delivery_mode"
                  checked={!form.backup_enabled}
                  onChange={() => setForm((prev) => ({ ...prev, backup_enabled: false }))}
                  className="mt-1"
                  data-testid="uber-direct-mode-internal"
                />
                <span>
                  <span className="font-medium">ZoomEats Drivers Only</span>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>Orders stay pending for internal driver assignment.</p>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="delivery_mode"
                  checked={form.backup_enabled}
                  onChange={() => setForm((prev) => ({ ...prev, backup_enabled: true }))}
                  className="mt-1"
                  data-testid="uber-direct-mode-backup"
                />
                <span>
                  <span className="font-medium">ZoomEats Drivers + Uber Direct Backup</span>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>Uber couriers are requested when no internal drivers are available.</p>
                </span>
              </label>
            </div>
          </div>

          <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <h3 className="font-display font-bold mb-4">Uber API Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium">Client ID</span>
                <input
                  type="text"
                  className="input-field mt-1 w-full"
                  value={form.client_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, client_id: e.target.value }))}
                  placeholder="Uber Direct client ID"
                  data-testid="uber-direct-client-id"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Customer ID</span>
                <input
                  type="text"
                  className="input-field mt-1 w-full"
                  value={form.customer_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, customer_id: e.target.value }))}
                  placeholder="Uber Direct customer ID"
                  data-testid="uber-direct-customer-id"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium">Client Secret</span>
                <input
                  type="password"
                  className="input-field mt-1 w-full"
                  value={form.client_secret}
                  onChange={(e) => setForm((prev) => ({ ...prev, client_secret: e.target.value }))}
                  placeholder={data.has_client_secret ? "Saved — enter a new value to replace" : "Uber Direct client secret"}
                  autoComplete="new-password"
                  data-testid="uber-direct-client-secret"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Environment</span>
                <select
                  className="input-field mt-1 w-full"
                  value={form.environment}
                  onChange={(e) => setForm((prev) => ({ ...prev, environment: e.target.value }))}
                  data-testid="uber-direct-environment"
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-primary !py-2 text-sm"
                onClick={saveConfiguration}
                disabled={liveBusy}
                data-testid="uber-direct-save-config"
              >
                {saving ? "Saving…" : "Save Configuration"}
              </button>
              <button
                type="button"
                className="btn-ghost !py-2 text-sm inline-flex items-center gap-2"
                onClick={testConnection}
                disabled={liveBusy}
                data-testid="uber-direct-test-auth"
              >
                <RefreshCw size={16} className={testing ? "animate-spin" : ""} />
                Test Authentication
              </button>
              <button
                type="button"
                className="btn-ghost !py-2 text-sm text-red-400"
                onClick={resetConfiguration}
                disabled={liveBusy}
                data-testid="uber-direct-reset-config"
              >
                {resetting ? "Resetting…" : "Reset Configuration"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Truck size={20} style={{ color: "var(--primary)" }} />
                <h2 className="font-display text-xl font-bold">Connection</h2>
              </div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Monitor Uber Direct integration health and run live API checks.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Configuration</span>
              <StatusPill ok={configComplete} label={formatStatusLabel(status.configuration)} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Integration</span>
              <StatusPill ok={integrationEnabled} label={formatStatusLabel(status.integration)} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Connection</span>
              <StatusPill ok={connectionOk} label={formatStatusLabel(status.connection)} />
            </div>
          </div>

          {(data.customer_id || data.client_id) && (
            <div className="mt-4 text-sm grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ color: "var(--muted)" }}>
              {data.customer_id && <div>Customer ID: <span className="font-mono">{data.customer_id}</span></div>}
              {data.client_id && <div>Client ID: <span className="font-mono">{data.client_id}</span></div>}
              <div>Environment: <span className="font-mono">{data.environment || "sandbox"}</span></div>
            </div>
          )}

          {!data.auth?.ok && data.auth?.error && (
            <p className="mt-4 text-sm text-red-400">{String(data.auth.error)}</p>
          )}

          {liveMessage && ["auth", "save", "reset"].includes(liveResult?.action) && (
            <p
              className={`mt-4 text-sm ${liveResult?.ok ? "text-green-400" : "text-red-400"}`}
              data-testid="uber-direct-config-result"
            >
              {liveMessage}
            </p>
          )}

          <div className="mt-6 p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical size={16} style={{ color: "var(--primary)" }} />
              <h3 className="font-display font-bold text-sm">Live API tests</h3>
            </div>
            <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
              Sandbox-safe checks against Uber Direct. Quote does not create a delivery.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary !py-2 text-sm"
                onClick={() => runLiveTest("quote")}
                disabled={liveBusy}
                data-testid="uber-direct-test-quote"
              >
                {liveAction === "quote" ? "Running…" : "Test quote"}
              </button>
              <button
                type="button"
                className="btn-ghost !py-2 text-sm"
                onClick={() => runLiveTest("inspect")}
                disabled={liveBusy}
                data-testid="uber-direct-test-inspect"
              >
                {liveAction === "inspect" ? "Running…" : "Inspect latest"}
              </button>
              <button
                type="button"
                className="btn-ghost !py-2 text-sm"
                onClick={() => runLiveTest("cancel")}
                disabled={liveBusy}
                data-testid="uber-direct-test-cancel"
              >
                {liveAction === "cancel" ? "Canceling…" : "Cancel latest"}
              </button>
            </div>
            {liveMessage && !["auth", "save", "reset"].includes(liveResult?.action) && (
              <p
                className={`mt-3 text-sm ${liveResult?.ok ? "text-green-400" : "text-red-400"}`}
                data-testid="uber-direct-live-result"
              >
                {liveMessage}
              </p>
            )}
          </div>

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
                  <th className="text-left p-3">Actions</th>
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
                    <td className="p-3">
                      {d.active && d.uber_delivery_id ? (
                        <button
                          type="button"
                          className="btn-ghost !py-1 !px-2 text-xs"
                          disabled={liveBusy}
                          onClick={() => runLiveTest("cancel", d.uber_delivery_id)}
                        >
                          {liveAction === "cancel" ? "…" : "Cancel"}
                        </button>
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
