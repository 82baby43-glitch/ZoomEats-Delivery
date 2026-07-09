import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { runLaunchAudit } from "../lib/launchAudit/engine";
import { runFullDeliverySimulation } from "../lib/launchAudit/testOrder";
import { evaluateRestaurantReadiness } from "../lib/restaurant/readiness";

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

  const { data: rests } = await db.from("restaurants").select("restaurant_id,name,approved,owner_id,latitude,longitude,accepting_orders,launch_status").eq("approved", true);
  console.log("Approved restaurants:", rests?.length);
  for (const r of rests || []) {
    const { count } = await db.from("menu_items").select("*", { count: "exact", head: true }).eq("restaurant_id", r.restaurant_id).eq("available", true);
    const { data: ob } = await db.from("restaurant_onboarding").select("stripe_connect_id,stripe_connect_complete").eq("restaurant_id", r.restaurant_id).maybeSingle();
    const readiness = await evaluateRestaurantReadiness(db, r.restaurant_id);
    console.log(`- ${r.name}: menu=${count} owner=${r.owner_id || "MISSING"} stripe=${ob?.stripe_connect_id ? "linked" : "none"} can_go_live=${readiness?.can_go_live} blockers=${readiness?.blockers?.join("; ")}`);
  }

  console.log("\n--- Full simulation ---");
  const sim = await runFullDeliverySimulation(db);
  console.log("Simulation success:", sim.success, sim.report_summary);
  for (const c of sim.checks.filter((x) => x.status === "fail")) {
    console.log("SIM FAIL:", c.id, c.name, c.severity, c.detail);
  }

  console.log("\n--- Full audit ---");
  const report = await runLaunchAudit(db, { simulate_e2e: true, probe_frontend: false });
  console.log("Score:", report.launch_score, "Status:", report.status);

  const critical = report.checks.filter((c) => c.status === "fail" && c.severity === "critical");
  for (const c of critical) {
    console.log("\n=== CRITICAL ===");
    console.log("Failure:", c.name);
    console.log("Severity:", c.severity);
    console.log("Component:", c.category);
    console.log("Cause:", c.detail);
    if (c.fix) console.log("Recommended Fix:", c.fix.suggested_fix);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
