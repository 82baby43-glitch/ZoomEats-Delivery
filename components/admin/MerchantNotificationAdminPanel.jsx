"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { playMerchantAlert, primeChime } from "@/lib/chime";
import { Bell, Loader2, RefreshCw } from "lucide-react";

export default function MerchantNotificationAdminPanel() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");
  const [environment, setEnvironment] = useState("sandbox");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/admin/merchant-notifications/status");
      setStatus(res?.data || res);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const testSound = async () => {
    setBusy("sound");
    try {
      primeChime();
      playMerchantAlert("chime", 0.9);
      await api.post("/admin/merchant-notifications/test-sound", { environment });
      await load();
    } catch (e) {
      alert(e?.message || "Test failed");
    } finally {
      setBusy("");
    }
  };

  const sendTestOrder = async () => {
    setBusy("order");
    try {
      await api.post("/admin/restaurant-simulator/create-order");
      await load();
      alert("Test order created. Open the Restaurant Simulator dashboard tab to verify alerts.");
    } catch (e) {
      alert(e?.message || "Could not create test order");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="card p-6 space-y-5" data-testid="merchant-notification-admin">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Bell size={20} style={{ color: "var(--primary)" }} /> Merchant notification controls
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Test sounds, send sandbox orders, and monitor delivery events for all merchant types.
          </p>
        </div>
        <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={load}>
          <RefreshCw size={14} /> Refresh log
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="label-eyebrow">Environment</label>
          <select className="input-field" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
            <option value="sandbox">Sandbox (simulator)</option>
            <option value="production">Production</option>
          </select>
        </div>
        <button type="button" className="btn-primary text-sm" disabled={!!busy} onClick={testSound}>
          {busy === "sound" ? <Loader2 className="animate-spin" size={14} /> : null} Test merchant sound
        </button>
        <button type="button" className="btn-secondary text-sm" disabled={!!busy} onClick={sendTestOrder}>
          {busy === "order" ? <Loader2 className="animate-spin" size={14} /> : null} Send test order
        </button>
      </div>

      <div
        className="text-sm px-3 py-2 rounded-lg"
        style={{
          background: status?.delivery_ok === false ? "rgba(252,165,165,0.1)" : "rgba(134,239,172,0.1)",
          color: status?.delivery_ok === false ? "var(--error)" : "var(--success)",
        }}
      >
        {status?.delivery_ok === false ? "Recent notification failures detected" : "No recent notification failures"}
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto text-xs" style={{ color: "var(--muted)" }}>
        {(status?.events || []).map((e) => (
          <div key={e.id || e.created_at} className="border-b pb-2" style={{ borderColor: "var(--border)" }}>
            <span className="font-mono">{e.event_type}</span> · {e.message}
          </div>
        ))}
        {!status?.events?.length && <div>No notification events logged yet.</div>}
      </div>
    </div>
  );
}
