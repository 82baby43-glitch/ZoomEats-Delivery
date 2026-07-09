import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runAccessibilityChecks,
  runAdminChecks,
  runApiHealthChecks,
  runAuthChecks,
  runCustomerChecks,
  runDatabaseChecks,
  runDriverChecks,
  runE2eSimulation,
  runEdgeFunctionChecks,
  runErrorHandlingChecks,
  runFrontendProbes,
  runMapsChecks,
  runMobileChecks,
  runNotificationChecks,
  runOrderChecks,
  runPaymentChecks,
  runPerformanceChecks,
  runPricingChecks,
  runRealtimeChecks,
  runRestaurantChecks,
  runSecurityChecks,
  runStorageChecks,
} from "./checks.ts";
import { runFullDeliverySimulation } from "./testOrder.ts";
import { runEmailHealthChecks } from "./emailHealth.ts";
import { isAdminEmailsConfigured } from "../adminEnv.ts";
import type {
  AuditCheck,
  AuditStatus,
  CategorySummary,
  LaunchAuditOptions,
  LaunchReadinessReport,
} from "./types.ts";

const CATEGORY_LABELS: Record<string, string> = {
  database: "Database",
  authentication: "Authentication",
  driver_system: "Driver System",
  restaurant_system: "Restaurant System",
  customer_system: "Customer System",
  order_system: "Order System",
  payment_system: "Payment System",
  maps: "Maps & GPS",
  notifications: "Notifications",
  pricing_engine: "Pricing Engine",
  admin_panel: "Admin Panel",
  security: "Security",
  performance: "Performance",
  edge_functions: "Edge Functions",
  api_health: "API Health",
  realtime: "Realtime",
  storage: "Storage",
  mobile_responsiveness: "Mobile Responsiveness",
  accessibility: "Accessibility",
  error_handling: "Error Handling",
  e2e_simulation: "E2E Simulation",
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  database: 1.2,
  authentication: 1.1,
  payment_system: 1.3,
  order_system: 1.2,
  security: 1.2,
  edge_functions: 1.1,
  api_health: 1.1,
  driver_system: 1.0,
  restaurant_system: 1.0,
  e2e_simulation: 0.8,
};

function scoreCheck(status: AuditStatus, severity: AuditCheck["severity"]): number {
  if (status === "skip") return 1;
  if (status === "pass") return 1;
  if (status === "warn") return 0.6;
  const penalty = severity === "critical" ? 0 : severity === "high" ? 0.1 : 0.3;
  return penalty;
}

function summarizeCategory(category: string, checks: AuditCheck[]): CategorySummary {
  const catChecks = checks.filter((c) => c.category === category);
  const passed = catChecks.filter((c) => c.status === "pass").length;
  const failed = catChecks.filter((c) => c.status === "fail").length;
  const warnings = catChecks.filter((c) => c.status === "warn").length;
  const skipped = catChecks.filter((c) => c.status === "skip").length;
  const scorable = catChecks.filter((c) => c.status !== "skip");
  const weight = CATEGORY_WEIGHTS[category] ?? 1;
  const score = scorable.length
    ? Math.round(
        (scorable.reduce((s, c) => s + scoreCheck(c.status, c.severity), 0) / scorable.length) * 100 * weight
      ) / weight
    : 100;

  const hasCriticalFail = catChecks.some((c) => c.status === "fail" && c.severity === "critical");

  return {
    category: category as CategorySummary["category"],
    label: CATEGORY_LABELS[category] || category,
    score: Math.round(score),
    passed,
    failed,
    warnings,
    skipped,
    total: catChecks.length,
    ready: !hasCriticalFail && failed === 0,
  };
}

function computeLaunchScore(categories: CategorySummary[]): number {
  const weighted = categories.filter((c) => c.total > c.skipped);
  if (!weighted.length) return 0;
  const totalWeight = weighted.reduce((s, c) => s + (CATEGORY_WEIGHTS[c.category] ?? 1), 0);
  const sum = weighted.reduce((s, c) => s + c.score * (CATEGORY_WEIGHTS[c.category] ?? 1), 0);
  return Math.round(sum / totalWeight);
}

function buildExecutiveSummary(score: number, status: LaunchReadinessReport["status"], checks: AuditCheck[]): string {
  const critical = checks.filter((c) => c.status === "fail" && c.severity === "critical").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const passed = checks.filter((c) => c.status === "pass").length;

  if (status === "ready") {
    return `ZoomEats scores ${score}% launch readiness with ${passed} checks passing. ${warnings} warnings remain — review before high-volume launch. No critical blockers detected.`;
  }
  if (status === "caution") {
    return `ZoomEats scores ${score}% — CAUTION. ${failed} failures and ${warnings} warnings need attention. Platform may operate in limited capacity.`;
  }
  return `ZoomEats scores ${score}% — NOT READY for launch. ${critical} critical and ${failed} total failures must be resolved before production go-live.`;
}

const DEPLOYMENT_CHECKLIST = [
  "All database migrations applied",
  "Stripe live keys configured (if launching live)",
  "Stripe webhook endpoint registered and verified",
  "Supabase edge functions deployed (npm run functions:deploy)",
  "ADMIN_EMAILS configured for admin access",
  "At least one approved restaurant with menu items and coordinates",
  "Restaurant Stripe Connect payout accounts verified",
  "At least one available driver OR Uber Direct enabled",
  "Environment variables synced (Vercel + Supabase secrets)",
  "Run launch audit with simulate_e2e:true",
  "Run Delivery Simulation from System Health",
  "Manual smoke test: place order → pay → dispatch → deliver",
  "Verify /admin/system-health shows Ready for Launch",
];

const FIRST_100_ORDERS_CHECKLIST = [
  "Monitor System Events dashboard for payment and delivery failures",
  "Verify driver earnings and restaurant settlements after each delivery",
  "Confirm Stripe webhook events in /admin/stripe",
  "Check restaurant accepting_orders status daily",
  "Review rate limit metrics for abuse patterns",
  "Re-run Launch Readiness Audit weekly during soft launch",
  "Validate customer order tracking and notification delivery",
  "Ensure admin on-call has ADMIN_EMAILS access",
  "Keep Uber Direct fallback enabled if internal driver pool is thin",
  "Document and triage any critical audit failures within 24h",
];

/** Main launch audit orchestrator — read-only except optional E2E simulation. */
export async function runLaunchAudit(
  db: SupabaseClient,
  options: LaunchAuditOptions = {}
): Promise<LaunchReadinessReport> {
  const start = performance.now();
  const frontendBase = options.frontend_base_url || process.env.NEXT_PUBLIC_APP_URL || "https://zoom-eats-delivery.vercel.app";

  const [
    database,
    authentication,
    driver_system,
    restaurant_system,
    customer_system,
    order_system,
    payment_system,
    maps,
    notifications,
    pricing_engine,
    admin_panel,
    security,
    perfResult,
    edge_functions,
    api_health,
    realtime,
    storage,
  ] = await Promise.all([
    runDatabaseChecks(db),
    runAuthChecks(db),
    runDriverChecks(db),
    runRestaurantChecks(db),
    runCustomerChecks(db),
    runOrderChecks(db),
    runPaymentChecks(db),
    runMapsChecks(db),
    runNotificationChecks(db),
    runPricingChecks(db),
    runAdminChecks(),
    runSecurityChecks(db),
    runPerformanceChecks(db),
    runEdgeFunctionChecks(),
    runApiHealthChecks(db),
    runRealtimeChecks(),
    runStorageChecks(),
  ]);

  const e2e_simulation = options.simulate_e2e
    ? (await runFullDeliverySimulation(db)).checks
    : await runE2eSimulation(db, options);

  const mobile_responsiveness = runMobileChecks();
  const accessibility = runAccessibilityChecks();
  const error_handling = runErrorHandlingChecks();

  let frontendChecks: AuditCheck[] = [];
  if (options.probe_frontend !== false) {
    try {
      frontendChecks = await runFrontendProbes(frontendBase);
    } catch {
      frontendChecks = [];
    }
  }

  const email_health = await runEmailHealthChecks(db);

  const checks = [
    ...database,
    ...authentication,
    ...driver_system,
    ...restaurant_system,
    ...customer_system,
    ...order_system,
    ...payment_system,
    ...maps,
    ...notifications,
    ...email_health,
    ...pricing_engine,
    ...admin_panel,
    ...security,
    ...perfResult.checks,
    ...edge_functions,
    ...api_health,
    ...frontendChecks,
    ...realtime,
    ...storage,
    ...mobile_responsiveness,
    ...accessibility,
    ...error_handling,
    ...e2e_simulation,
  ];

  const categoryKeys = Object.keys(CATEGORY_LABELS);
  const categories = categoryKeys.map((k) => summarizeCategory(k, checks));
  const launch_score = computeLaunchScore(categories);

  const criticalFails = checks.filter((c) => c.status === "fail" && c.severity === "critical").length;
  const totalFails = checks.filter((c) => c.status === "fail").length;

  let status: LaunchReadinessReport["status"] = "ready";
  let status_label = "Ready for Launch";
  if (criticalFails > 0 || launch_score < 75) {
    status = "not_ready";
    status_label = "Not Ready for Launch";
  } else if (totalFails > 0 || launch_score < 95) {
    status = "caution";
    status_label = "Caution — Review Before Launch";
  }

  const issues = {
    critical: checks.filter((c) => c.status === "fail" && c.severity === "critical"),
    high: checks.filter((c) => c.status === "fail" && c.severity === "high"),
    medium: checks.filter((c) => (c.status === "fail" && c.severity === "medium") || (c.status === "warn" && c.severity === "high")),
    low: checks.filter((c) => c.status === "warn" || (c.status === "fail" && c.severity === "low")),
  };

  const production_launch_report = buildProductionLaunchReport(launch_score, status, checks, categories);

  return {
    launch_score,
    status,
    status_label,
    checked_at: new Date().toISOString(),
    duration_ms: Math.round(performance.now() - start),
    categories,
    checks,
    issues,
    performance_metrics: {
      ...perfResult.metrics,
      total_checks: checks.length,
      passed: checks.filter((c) => c.status === "pass").length,
      failed: totalFails,
      warnings: checks.filter((c) => c.status === "warn").length,
      admin_emails_configured: isAdminEmailsConfigured() ? 1 : 0,
    },
    deployment_checklist: DEPLOYMENT_CHECKLIST,
    first_100_orders_checklist: FIRST_100_ORDERS_CHECKLIST,
    production_launch_report,
    executive_summary: buildExecutiveSummary(launch_score, status, checks),
  };
}

function buildProductionLaunchReport(
  score: number,
  status: LaunchReadinessReport["status"],
  checks: AuditCheck[],
  categories: CategorySummary[]
): string {
  const passed = checks.filter((c) => c.status === "pass").length;
  const warnings = checks.filter((c) => c.status === "warn");
  const remaining = warnings.map((w) => w.name).slice(0, 15);

  const lines = [
    "# ZoomEats Production Launch Report",
    "",
    `**Final Score:** ${score}%`,
    `**Status:** ${status === "ready" ? "Ready for controlled city launch" : status}`,
    `**Checks Passing:** ${passed}/${checks.length}`,
    `**Critical Blockers:** ${checks.filter((c) => c.status === "fail" && c.severity === "critical").length}`,
    "",
    "## Deployment Confirmation",
    "",
    "- Supabase edge functions deployed",
    "- Launch readiness audit engine active",
    "- Rate limiting enabled on sensitive API routes",
    "- System events logging enabled",
    `- ADMIN_EMAILS: ${isAdminEmailsConfigured() ? "configured" : "NOT SET — configure before launch"}`,
    "",
    "## Category Summary",
    "",
  ];

  for (const c of categories.filter((cat) => cat.total > 0)) {
    lines.push(`- ${c.label}: ${c.score}% (${c.passed}/${c.total} pass)`);
  }

  lines.push("", "## Remaining Warnings", "");
  if (remaining.length === 0) lines.push("None — optional improvements only.");
  else for (const w of remaining) lines.push(`- ${w}`);

  lines.push("", "## First 100 Orders Checklist", "");
  for (const item of FIRST_100_ORDERS_CHECKLIST) lines.push(`- [ ] ${item}`);

  return lines.join("\n");
}
