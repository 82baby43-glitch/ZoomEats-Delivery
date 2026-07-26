"use client";

import { useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

function CheckRow({ check }) {
  const icon = check.status === "pass" ? "✅" : check.status === "fail" ? "❌" : check.status === "warn" ? "⚠️" : "⏭️";
  return (
    <div className="p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-start justify-between gap-2">
        <span>{icon} <strong>{check.name}</strong></span>
        <span className="text-xs uppercase shrink-0" style={{ color: "var(--muted)" }}>{check.severity}</span>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{check.detail}</p>
    </div>
  );
}

export default function DeliverySimulationPanel() {
  const [deliveryResult, setDeliveryResult] = useState(null);
  const [e2eResult, setE2eResult] = useState(null);
  const [runningDelivery, setRunningDelivery] = useState(false);
  const [runningE2e, setRunningE2e] = useState(false);

  const runDeliverySimulation = async () => {
    setRunningDelivery(true);
    try {
      const r = await api.post("/admin/system-health/simulation");
      setDeliveryResult(r?.data || r);
    } catch (e) {
      alert(e?.message || "Delivery simulation failed");
    } finally {
      setRunningDelivery(false);
    }
  };

  const runE2eSimulation = async () => {
    setRunningE2e(true);
    try {
      const r = await api.post("/admin/launch-audit/run", { simulate_e2e: true, probe_frontend: true });
      setE2eResult(r?.data || r);
    } catch (e) {
      alert(e?.message || "E2E simulation failed");
    } finally {
      setRunningE2e(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="delivery-simulation-panel">
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Activity size={20} style={{ color: "var(--primary)" }} />
          <h2 className="font-display text-xl font-bold">Delivery simulation</h2>
        </div>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Simulates customer order → restaurant acceptance → driver assignment → pickup → delivery → payment capture.
          Generates a simulation ID, pass/fail report, and cleans up test data.
        </p>
        <button type="button" className="btn-primary" disabled={runningDelivery} onClick={runDeliverySimulation}>
          {runningDelivery ? "Running simulation…" : "Run delivery simulation"}
        </button>
        {deliveryResult && (
          <div className="space-y-2 mt-4">
            <div className="p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
              <p><strong>Simulation ID:</strong> {deliveryResult.simulation_id}</p>
              <p className="mt-1"><strong>Completed:</strong> {deliveryResult.completed_at ? new Date(deliveryResult.completed_at).toLocaleString() : "—"}</p>
              <p className="mt-1"><strong>Report:</strong> {deliveryResult.report_summary || (deliveryResult.success ? "PASS" : "FAIL")}</p>
            </div>
            {deliveryResult.checks?.map((c) => <CheckRow key={c.id} check={c} />)}
          </div>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw size={20} style={{ color: "var(--primary)" }} />
          <h2 className="font-display text-xl font-bold">Launch E2E audit simulation</h2>
        </div>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Runs the full launch audit with end-to-end probes. Use this before releases — not for day-to-day production monitoring.
        </p>
        <button type="button" className="btn-secondary" disabled={runningE2e} onClick={runE2eSimulation}>
          {runningE2e ? "Running E2E simulation…" : "Run E2E simulation"}
        </button>
        {e2eResult && (
          <div className="p-3 rounded-lg text-sm mt-4" style={{ background: "var(--surface-2)" }}>
            <p><strong>Launch score:</strong> {e2eResult.launch_score ?? "—"}%</p>
            <p className="mt-1"><strong>Status:</strong> {e2eResult.status_label || e2eResult.status || "—"}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{e2eResult.executive_summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}
