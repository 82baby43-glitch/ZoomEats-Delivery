"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  Shield,
  XCircle,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { ADMIN_EMAILS_WARNING } from "@/lib/adminEnv";

const TABS = [
  { id: "readiness", label: "Launch Readiness", icon: Zap },
  { id: "simulation", label: "Delivery Simulation", icon: Activity },
  { id: "events", label: "System Events", icon: AlertTriangle },
  { id: "status", label: "Live System Status", icon: Activity },
  { id: "failed", label: "Failed Checks", icon: XCircle },
  { id: "performance", label: "Performance Metrics", icon: Activity },
  { id: "security", label: "Security Audit", icon: Shield },
  { id: "report", label: "Download Report", icon: Download },
];

function ScoreRing({ score, status }) {
  const color = status === "ready" ? "#4ade80" : status === "caution" ? "#fbbf24" : "#f87171";
  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${score * 2.64} 264`} strokeLinecap="round"
        />
      </svg>
      <div className="text-center z-10">
        <div className="font-display text-4xl font-bold" style={{ color }}>{score}%</div>
        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Launch Score</div>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }) {
  const styles = {
    ready: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
    caution: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
    not_ready: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
  }[status] || { bg: "var(--surface-2)", color: "var(--muted)" };

  return (
    <span className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-full" style={{ background: styles.bg, color: styles.color }}>
      {status === "ready" ? <CheckCircle2 size={16} /> : status === "caution" ? <AlertTriangle size={16} /> : <XCircle size={16} />}
      {label}
    </span>
  );
}

function CheckRow({ check }) {
  const icon = check.status === "pass" ? "✅" : check.status === "fail" ? "❌" : check.status === "warn" ? "⚠️" : "⏭️";
  return (
    <div className="p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-start justify-between gap-2">
        <span>{icon} <strong>{check.name}</strong></span>
        <span className="text-xs uppercase shrink-0" style={{ color: "var(--muted)" }}>{check.severity}</span>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{check.detail}</p>
      {check.fix && check.status === "fail" && (
        <div className="mt-2 p-2 rounded text-xs border border-white/5">
          <p><strong>Problem:</strong> {check.fix.problem}</p>
          <p className="mt-1"><strong>Fix:</strong> {check.fix.suggested_fix}</p>
          <p className="mt-1" style={{ color: "var(--muted)" }}>Effort: {check.fix.estimated_effort}</p>
        </div>
      )}
    </div>
  );
}

export default function SystemHealthDashboard({ initialTab = "readiness" }) {
  const [tab, setTab] = useState(initialTab);
  const [report, setReport] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [systemEvents, setSystemEvents] = useState([]);
  const [rateLimits, setRateLimits] = useState(null);
  const [adminConfig, setAdminConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (refresh = false, simulate = false) => {
    setRunning(true);
    try {
      const path = simulate
        ? "/admin/launch-audit/run"
        : `/admin/launch-audit${refresh ? "?refresh=true" : ""}`;
      const r = simulate
        ? await api.post(path, { simulate_e2e: true, probe_frontend: true })
        : await api.get(path);
      setReport(r?.data || r);
      setError(false);
    } catch (e) {
      console.warn(e);
      setError(true);
    } finally {
      setLoading(false);
      setRunning(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get("/admin/system-health/admin-config").then((r) => setAdminConfig(r?.data || r)).catch(() => {});
  }, []);

  const runFullTest = async () => {
    setRunning(true);
    try {
      const r = await api.post("/admin/system-health/simulation");
      setTestResult(r?.data || r);
    } catch (e) {
      alert(e?.message || "Delivery simulation failed");
    } finally {
      setRunning(false);
    }
  };

  const loadEvents = async () => {
    try {
      const [eventsRes, rateRes] = await Promise.all([
        api.get("/admin/system-health/events"),
        api.get("/admin/system-health/rate-limits"),
      ]);
      setSystemEvents(eventsRes?.data?.events || eventsRes?.events || []);
      setRateLimits(rateRes?.data || rateRes);
    } catch (e) {
      console.warn(e);
    }
  };

  useEffect(() => {
    if (tab === "events") loadEvents();
  }, [tab]);

  const downloadProductionReport = async () => {
    try {
      const r = await api.get("/admin/launch-audit/production-report.md");
      const blob = new Blob([r?.data?.content || r?.content || ""], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r?.data?.filename || r?.filename || "production-launch-report.md";
      a.click();
    } catch (e) {
      alert(e?.message || "Download failed");
    }
  };

  const adminWarning = adminConfig && !adminConfig.admin_emails_configured
    ? (adminConfig.warning || ADMIN_EMAILS_WARNING)
    : null;

  const downloadReport = async (format) => {
    try {
      const r = await api.get(`/admin/launch-audit/report.${format}`);
      const blob = new Blob([r?.data?.content || r?.content || ""], {
        type: format === "json" ? "application/json" : "text/markdown",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r?.data?.filename || r?.filename || `launch-report.${format}`;
      a.click();
    } catch (e) {
      alert(e?.message || "Download failed");
    }
  };

  if (loading && !report) return <LoadingSkeleton rows={8} />;
  if (error && !report) return <ErrorState message="Could not load launch audit" onRetry={() => load(true)} />;

  const failedChecks = (report?.checks || []).filter((c) => c.status === "fail");
  const securityChecks = (report?.checks || []).filter((c) => c.category === "security");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="label-eyebrow">System Health</div>
          <h1 className="font-display text-3xl font-bold mt-1">Launch Readiness Audit</h1>
          <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
            Automated inspection of every major ZoomEats subsystem. Read-only — does not modify production data unless E2E simulation is run.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" disabled={running} onClick={() => load(true)}>
            <RefreshCw size={14} className={running ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" className="btn-secondary text-sm" disabled={running} onClick={() => load(true, true)}>
            Run E2E Simulation
          </button>
        </div>
      </div>

      {adminWarning && (
        <div
          className="card p-4 flex items-start gap-3 border border-amber-500/30"
          role="alert"
          style={{ background: "rgba(251,191,36,0.08)" }}
        >
          <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-400">Admin Security Warning</p>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{adminWarning}</p>
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              Set <code>ADMIN_EMAILS</code> and <code>NEXT_PUBLIC_ADMIN_EMAILS</code> in Vercel and Supabase secrets.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-white/5 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`text-sm px-3 py-2 rounded-lg inline-flex items-center gap-2 transition-colors ${
              tab === t.id ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "hover:bg-white/5"
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "readiness" && report && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="card p-6 flex flex-col items-center justify-center gap-4">
            <ScoreRing score={report.launch_score} status={report.status} />
            <StatusBadge status={report.status} label={report.status_label} />
            <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
              Audited {new Date(report.checked_at).toLocaleString()} · {report.duration_ms}ms
              {report.cached && " · cached"}
            </p>
          </div>
          <div className="lg:col-span-2 card p-6">
            <h2 className="font-bold mb-3">Executive Summary</h2>
            <p className="text-sm leading-relaxed">{report.executive_summary}</p>
            <div className="grid sm:grid-cols-3 gap-3 mt-6">
              <div className="p-3 rounded-lg text-center" style={{ background: "var(--surface-2)" }}>
                <div className="text-2xl font-bold text-green-400">{report.performance_metrics?.passed ?? 0}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>Passed</div>
              </div>
              <div className="p-3 rounded-lg text-center" style={{ background: "var(--surface-2)" }}>
                <div className="text-2xl font-bold text-amber-400">{report.performance_metrics?.warnings ?? 0}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>Warnings</div>
              </div>
              <div className="p-3 rounded-lg text-center" style={{ background: "var(--surface-2)" }}>
                <div className="text-2xl font-bold text-red-400">{report.performance_metrics?.failed ?? 0}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>Failed</div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-3 card p-6">
            <h2 className="font-bold mb-4">Category Scores</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(report.categories || []).filter((c) => c.total > 0).map((c) => (
                <div key={c.category} className="p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{c.label}</span>
                    <span className={`font-bold ${c.score >= 90 ? "text-green-400" : c.score >= 75 ? "text-amber-400" : "text-red-400"}`}>
                      {c.score}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface)" }}>
                    <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: c.ready ? "#4ade80" : "#f87171" }} />
                  </div>
                  <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                    {c.passed} pass · {c.failed} fail · {c.warnings} warn
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "simulation" && (
        <div className="card p-6 space-y-4">
          <h2 className="font-bold">Launch Simulation Mode</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Simulates customer order → restaurant acceptance → driver assignment → pickup → delivery → payment capture → earnings/payout verification. Generates a simulation ID and pass/fail report, then cleans up test data.
          </p>
          <button type="button" className="btn-primary" disabled={running} onClick={runFullTest} aria-label="Run delivery simulation">
            {running ? "Running simulation…" : "Run Delivery Simulation"}
          </button>
          {testResult && (
            <div className="space-y-2 mt-4">
              <div className="p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
                <p><strong>Simulation ID:</strong> {testResult.simulation_id}</p>
                <p className="mt-1"><strong>Completed:</strong> {testResult.completed_at ? new Date(testResult.completed_at).toLocaleString() : "—"}</p>
                <p className="mt-1"><strong>Report:</strong> {testResult.report_summary || (testResult.success ? "PASS" : "FAIL")}</p>
              </div>
              {testResult.checks?.map((c) => <CheckRow key={c.id} check={c} />)}
            </div>
          )}
        </div>
      )}

      {tab === "events" && (
        <div className="space-y-4">
          <div className="card p-6">
            <h2 className="font-bold mb-4">System Events</h2>
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
              Production event log: failed payments, API errors, rate limit blocks, and simulation results.
            </p>
            {rateLimits && (
              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>Active buckets</div>
                  <div className="text-xl font-bold">{rateLimits.active_buckets ?? 0}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>Blocked requests</div>
                  <div className="text-xl font-bold">{rateLimits.total_blocked ?? 0}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>Rate limit rules</div>
                  <div className="text-xl font-bold">7 routes</div>
                </div>
              </div>
            )}
            {systemEvents.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>No system events recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {systemEvents.map((evt) => (
                  <div key={evt.event_id} className="p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
                    <div className="flex justify-between gap-2">
                      <strong>{evt.event_type}</strong>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{new Date(evt.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{evt.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {tab === "status" && report && (
        <div className="card p-6 space-y-4">
          <h2 className="font-bold">Live System Status</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {(report.categories || []).filter((c) => c.total > 0).map((c) => (
              <div key={c.category} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <span>{c.label}</span>
                <span className={c.ready ? "text-green-400" : "text-red-400"}>{c.ready ? "Operational" : "Issues"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "failed" && (
        <div className="space-y-3">
          {["critical", "high", "medium", "low"].map((sev) => {
            const items = report?.issues?.[sev] || [];
            if (!items.length) return null;
            return (
              <div key={sev} className="card p-5">
                <h3 className="font-bold capitalize mb-3">{sev} ({items.length})</h3>
                <div className="space-y-2">{items.map((c) => <CheckRow key={c.id} check={c} />)}</div>
              </div>
            );
          })}
          {failedChecks.length === 0 && (
            <div className="card p-8 text-center text-green-400">
              <CheckCircle2 size={32} className="mx-auto mb-2" />
              No failed checks
            </div>
          )}
        </div>
      )}

      {tab === "performance" && report && (
        <div className="card p-6">
          <h2 className="font-bold mb-4">Performance Metrics</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {Object.entries(report.performance_metrics || {}).map(([k, v]) => (
              <div key={k} className="p-4 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>{k.replace(/_/g, " ")}</div>
                <div className="text-2xl font-bold mt-1">{v ?? "—"}</div>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <h3 className="font-bold text-sm mb-2">Performance Checks</h3>
            <div className="space-y-2">
              {(report.checks || []).filter((c) => c.category === "performance").map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "security" && (
        <div className="space-y-3">
          {securityChecks.map((c) => <CheckRow key={c.id} check={c} />)}
        </div>
      )}

      {tab === "report" && (
        <div className="card p-6 space-y-4">
          <h2 className="font-bold">Download Launch Readiness Report</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Includes executive summary, category scores, failed tests, warnings, performance metrics, and deployment checklist.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => downloadReport("md")}>
              <Download size={16} /> Download Markdown
            </button>
            <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => downloadReport("json")}>
              <Download size={16} /> Download JSON
            </button>
            <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={downloadProductionReport}>
              <Download size={16} /> Production Launch Report
            </button>
          </div>
          {report?.first_100_orders_checklist?.length > 0 && (
            <div className="mt-6">
              <h3 className="font-bold text-sm mb-2">First 100 Orders Checklist</h3>
              <ul className="space-y-2 text-sm">
                {report.first_100_orders_checklist.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span style={{ color: "var(--muted)" }}>☐</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6">
            <h3 className="font-bold text-sm mb-2">Deployment Checklist</h3>
            <ul className="space-y-2 text-sm">
              {(report?.deployment_checklist || []).map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span style={{ color: "var(--muted)" }}>☐</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
