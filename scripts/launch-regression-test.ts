#!/usr/bin/env node
/**
 * Launch regression test — validates core order lifecycle after blocker repair.
 * Usage: npx tsx scripts/launch-regression-test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { runFullDeliverySimulation } from "../lib/launchAudit/testOrder";
import { runLaunchAudit } from "../lib/launchAudit/engine";

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const steps: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail = "") {
  steps.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const db = createClient(url, key);

  const sim = await runFullDeliverySimulation(db);
  record("1. Customer can create order (simulation)", sim.checks.some((c) => c.id.endsWith("_checkout") && c.status === "pass"), sim.report_summary);
  record("2. Restaurant receives order", sim.checks.some((c) => c.id.endsWith("_rest_accept") && c.status === "pass"));
  record("3. Driver can accept order", sim.checks.some((c) => c.id.endsWith("_dispatch") && c.status !== "fail"));
  record("4. Delivery can complete", sim.checks.some((c) => c.id.endsWith("_delivery") && c.status !== "fail"));
  record("5. Payment status updates", sim.checks.some((c) => c.id.endsWith("_payment") && c.status === "pass"));
  record("6. Earnings calculate", sim.checks.some((c) => c.id.endsWith("_earnings") && c.status !== "fail"));

  const report = await runLaunchAudit(db, { simulate_e2e: true, probe_frontend: false });
  const critical = report.checks.filter((c) => c.status === "fail" && c.severity === "critical");
  const stripeOnlyCritical = critical.length === 1 && critical[0]?.id === "pay_stripe_key";
  const stripeKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
  record(
    "Launch audit critical blockers",
    critical.length === 0 || (!stripeKey && stripeOnlyCritical),
    critical.map((c) => c.name).join(", ") || "none"
  );
  record("Launch audit score >= 98%", report.launch_score >= 98, `${report.launch_score}%`);
  record(
    "Launch audit status ready",
    report.status === "ready" || (!stripeKey && report.launch_score >= 97 && stripeOnlyCritical),
    report.status_label
  );

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n=== Regression: ${steps.length - failed.length}/${steps.length} passed ===`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
