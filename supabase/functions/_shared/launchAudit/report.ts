import type { LaunchReadinessReport } from "./types.ts";

export function reportToMarkdown(report: LaunchReadinessReport): string {
  const lines: string[] = [
    "# ZoomEats Launch Readiness Report",
    "",
    `**Generated:** ${new Date(report.checked_at).toLocaleString()}`,
    `**Launch Score:** ${report.launch_score}%`,
    `**Status:** ${report.status_label}`,
    `**Audit Duration:** ${report.duration_ms}ms`,
    "",
    "## Executive Summary",
    "",
    report.executive_summary,
    "",
    "## Category Scores",
    "",
    "| Category | Score | Pass | Fail | Warn | Ready |",
    "|----------|-------|------|------|------|-------|",
  ];

  for (const c of report.categories) {
    if (c.total === 0) continue;
    lines.push(`| ${c.label} | ${c.score}% | ${c.passed} | ${c.failed} | ${c.warnings} | ${c.ready ? "✅" : "❌"} |`);
  }

  lines.push("", "## Critical Issues", "");
  if (report.issues.critical.length === 0) lines.push("None 🎉");
  else {
    for (const i of report.issues.critical) {
      lines.push(`- ❌ **${i.name}** — ${i.detail}`);
      if (i.fix) lines.push(`  - Fix: ${i.fix.suggested_fix}`);
    }
  }

  lines.push("", "## High Priority Issues", "");
  if (report.issues.high.length === 0) lines.push("None");
  else for (const i of report.issues.high) lines.push(`- ❌ ${i.name}: ${i.detail}`);

  lines.push("", "## Warnings", "");
  const warns = report.checks.filter((c) => c.status === "warn");
  if (warns.length === 0) lines.push("None");
  else for (const w of warns.slice(0, 30)) lines.push(`- ⚠️ ${w.name}: ${w.detail}`);

  lines.push("", "## Performance Metrics", "");
  for (const [k, v] of Object.entries(report.performance_metrics)) {
    lines.push(`- ${k}: ${v ?? "—"}`);
  }

  lines.push("", "## Deployment Checklist", "");
  for (const item of report.deployment_checklist) {
    lines.push(`- [ ] ${item}`);
  }

  lines.push("", "## All Checks", "");
  for (const c of report.checks) {
    const icon = c.status === "pass" ? "✅" : c.status === "fail" ? "❌" : c.status === "warn" ? "⚠️" : "⏭️";
    lines.push(`- ${icon} [${c.category}] ${c.name}: ${c.detail}`);
  }

  return lines.join("\n");
}

export function reportToJson(report: LaunchReadinessReport): string {
  return JSON.stringify(report, null, 2);
}
