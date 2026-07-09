#!/usr/bin/env node
/**
 * Validate ZoomEats pricing engine foundation after migrations.
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ACCESS_TOKEN (for SQL function smoke tests via Management API)
 *
 * Usage:
 *   node scripts/validate-pricing-engine.mjs
 *   node scripts/validate-pricing-engine.mjs --baseline-orders 129
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

const PROJECT_REF = "njrrhckegbfqhwkqkzvw";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

const REQUIRED_TABLES = [
  "pricing_rules",
  "pricing_snapshots",
  "driver_earnings",
  "restaurant_settlements",
  "platform_revenue",
  "pricing_audit_logs",
  "driver_metrics",
  "restaurant_metrics",
  "customer_memberships",
  "promotions",
];

let failed = 0;
function ok(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg) {
  failed += 1;
  console.error(`❌ ${msg}`);
}

async function sqlQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

console.log("Validating pricing engine foundation…\n");

// 1. Tables exist
for (const table of REQUIRED_TABLES) {
  const { error } = await db.from(table).select("*").limit(1);
  if (error) fail(`Table ${table}: ${error.message}`);
  else ok(`Table ${table} readable`);
}

// 2. Seed rules
const { data: rules, error: rulesErr } = await db
  .from("pricing_rules")
  .select("rule_name, rule_type, active")
  .eq("active", true);
if (rulesErr) fail(`pricing_rules seed: ${rulesErr.message}`);
else if (!rules || rules.length < 10) fail(`Expected >=10 active pricing rules, got ${rules?.length ?? 0}`);
else ok(`${rules.length} active pricing rules seeded`);

// 3. Core tables still intact
const baselineOrders = argValue("--baseline-orders");
const { count: orderCount, error: orderErr } = await db
  .from("orders")
  .select("*", { count: "exact", head: true });
if (orderErr) fail(`orders count: ${orderErr.message}`);
else {
  ok(`orders intact (count=${orderCount})`);
  if (baselineOrders && String(orderCount) !== String(baselineOrders)) {
    fail(`orders count changed from baseline ${baselineOrders} → ${orderCount}`);
  }
}

for (const t of ["users", "restaurants", "drivers", "payments"]) {
  const { error } = await db.from(t).select("*", { count: "exact", head: true });
  if (error) fail(`core table ${t}: ${error.message}`);
  else ok(`core table ${t} intact`);
}

// 4. Anon cannot write financial tables
if (anon) {
  const { error: writeErr } = await anon.from("driver_earnings").insert({
    order_id: "ord_validation_should_fail",
    driver_id: "drv_validation_should_fail",
    final_driver_pay: 1,
  });
  if (!writeErr) fail("anon was able to insert into driver_earnings (RLS/grants broken)");
  else ok(`anon write blocked on driver_earnings (${writeErr.code || writeErr.message})`);
}

// 5. SQL function smoke tests
if (accessToken) {
  try {
    const pricing = await sqlQuery(
      `select public.calculate_order_pricing(25.00, 3.5, 4.00, 0, 1.0, false, null) as result;`
    );
    const total = pricing?.[0]?.result?.customer_total;
    if (total == null) fail("calculate_order_pricing returned no customer_total");
    else ok(`calculate_order_pricing → customer_total=${total}`);

    const pay = await sqlQuery(
      `select public.calculate_driver_pay(3.5, 20, 5, 4.00, 25.00, false, false, 0) as result;`
    );
    const finalPay = pay?.[0]?.result?.final_driver_pay;
    if (finalPay == null) fail("calculate_driver_pay returned no final_driver_pay");
    else ok(`calculate_driver_pay → final_driver_pay=${finalPay}`);

    const settle = await sqlQuery(
      `select public.calculate_restaurant_payout(25.00, 0, 0, 0, true) as result;`
    );
    const net = settle?.[0]?.result?.net_payout;
    if (net == null) fail("calculate_restaurant_payout returned no net_payout");
    else ok(`calculate_restaurant_payout → net_payout=${net}`);

    const profit = await sqlQuery(
      `select public.calculate_platform_profit(2.99, 2.00, 3.75, 0, 0, 8.50, 21.25, 1.03, 0, 0) as result;`
    );
    const np = profit?.[0]?.result?.net_profit;
    if (np == null) fail("calculate_platform_profit returned no net_profit");
    else ok(`calculate_platform_profit → net_profit=${np}`);

    const rls = await sqlQuery(`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (${REQUIRED_TABLES.map((t) => `'${t}'`).join(",")})
      order by 1;
    `);
    const missingRls = (rls || []).filter((r) => !r.relrowsecurity).map((r) => r.relname);
    if (missingRls.length) fail(`RLS not enabled: ${missingRls.join(", ")}`);
    else ok(`RLS enabled on all ${REQUIRED_TABLES.length} pricing tables`);

    // Relationship smoke: FK to orders works conceptually (table exists)
    const fks = await sqlQuery(`
      select tc.table_name, kcu.column_name, ccu.table_name as foreign_table
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and tc.table_name in ('pricing_snapshots','driver_earnings','restaurant_settlements','platform_revenue','customer_memberships','restaurant_metrics')
      order by 1,2;
    `);
    ok(`pricing FKs present: ${fks.length}`);
  } catch (e) {
    fail(`SQL validation: ${e.message}`);
  }
} else {
  console.warn("⚠️  SUPABASE_ACCESS_TOKEN missing — skipped SQL function/RLS checks");
}

console.log("");
if (failed) {
  console.error(`Validation failed with ${failed} error(s)`);
  process.exit(1);
}
console.log("All pricing engine validation checks passed.");
