import type { SupabaseClient } from "@supabase/supabase-js";
import { runLaunchAudit } from "./launchAudit/engine.ts";
import { reportToJson, reportToMarkdown } from "./launchAudit/report.ts";
import type { LaunchAuditOptions } from "./launchAudit/types.ts";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

type AdminCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

let cachedReport: { report: Awaited<ReturnType<typeof runLaunchAudit>>; at: number } | null = null;
const CACHE_MS = 60_000;

export async function handleLaunchAuditRequest(
  db: SupabaseClient,
  ctx: AdminCtx
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = ctx;

  if (!path.startsWith("/admin/launch-audit") && !path.startsWith("/admin/system-health")) {
    return null;
  }

  ctx.requireRole("admin");

  const options: LaunchAuditOptions = {
    simulate_e2e: !!body.simulate_e2e || params.simulate_e2e === "true",
    probe_frontend: body.probe_frontend !== false && params.probe_frontend !== "false",
    frontend_base_url: (body.frontend_base_url || params.frontend_base_url) as string | undefined,
  };

  if ((path === "/admin/launch-audit" || path === "/admin/system-health/audit") && method === "GET") {
    const force = params.refresh === "true" || params.force === "true";
    if (!force && cachedReport && Date.now() - cachedReport.at < CACHE_MS) {
      return { ...cachedReport.report, cached: true };
    }
    const report = await runLaunchAudit(db, options);
    cachedReport = { report, at: Date.now() };
    return report;
  }

  if ((path === "/admin/launch-audit/run" || path === "/admin/system-health/audit/run") && method === "POST") {
    const report = await runLaunchAudit(db, {
      ...options,
      simulate_e2e: body.simulate_e2e !== false,
    });
    cachedReport = { report, at: Date.now() };
    return report;
  }

  if (path === "/admin/launch-audit/report.md" && method === "GET") {
    const report = cachedReport?.report ?? await runLaunchAudit(db, options);
    return { content: reportToMarkdown(report), filename: `zoomeats-launch-readiness-${report.checked_at.slice(0, 10)}.md` };
  }

  if (path === "/admin/launch-audit/report.json" && method === "GET") {
    const report = cachedReport?.report ?? await runLaunchAudit(db, options);
    return { content: reportToJson(report), filename: `zoomeats-launch-readiness-${report.checked_at.slice(0, 10)}.json` };
  }

  if (path === "/admin/system-health/status" && method === "GET") {
    const report = cachedReport?.report ?? await runLaunchAudit(db, { ...options, probe_frontend: false });
    return {
      launch_score: report.launch_score,
      status: report.status,
      status_label: report.status_label,
      checked_at: report.checked_at,
      categories: report.categories.map((c) => ({ label: c.label, score: c.score, ready: c.ready })),
      performance_metrics: report.performance_metrics,
    };
  }

  throwErr("Launch audit route not found", 404);
}
