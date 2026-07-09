#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { runLaunchAudit } from "../lib/launchAudit/engine.ts";

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

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const db = createClient(url, key);
  const report = await runLaunchAudit(db, { simulate_e2e: true, probe_frontend: false });

  console.log("Score:", report.launch_score);
  console.log("Status:", report.status, report.status_label);

  const critical = report.checks.filter((c) => c.status === "fail" && c.severity === "critical");
  const failed = report.checks.filter((c) => c.status === "fail");
  console.log("Critical:", critical.length, "Failed:", failed.length);

  for (const c of critical) {
    console.log("\n=== CRITICAL FAILURE ===");
    console.log("Failure:", c.name);
    console.log("Severity:", c.severity);
    console.log("Component:", c.category);
    console.log("Cause:", c.detail);
    if (c.fix) console.log("Recommended Fix:", c.fix.suggested_fix);
  }
  for (const c of failed.filter((f) => f.severity !== "critical")) {
    console.log("\nFAIL:", c.id, "|", c.name, "|", c.severity, "|", c.detail);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
