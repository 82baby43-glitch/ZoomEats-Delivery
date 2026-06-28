#!/usr/bin/env node
/**
 * Verify Supabase connectivity.
 * Usage: node scripts/check-supabase.mjs
 * Loads .env.local automatically via dotenv if present.
 */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

console.log("Checking Supabase connection…");
console.log(`  URL: ${url}`);

// Auth
const { error: authErr } = await supabase.auth.getSession();
console.log(authErr ? `❌ Auth: ${authErr.message}` : "✅ Auth API reachable");

// Database (public restaurants)
const { data, error: dbErr } = await supabase
  .from("restaurants")
  .select("restaurant_id, name")
  .eq("approved", true)
  .limit(3);

if (dbErr) {
  console.log(`⚠️  Database: ${dbErr.message}`);
  console.log("   → Apply migration: supabase/migrations/20260628_supabase_auth_rls.sql");
} else {
  console.log(`✅ Database: ${data?.length ?? 0} restaurant(s) readable`);
  if (data?.length) data.forEach((r) => console.log(`   - ${r.name}`));
}

// Edge Function
const { error: fnErr } = await supabase.functions.invoke("api", {
  body: { path: "/", method: "GET" },
});
if (fnErr?.message?.includes("not found") || fnErr?.message?.includes("NOT_FOUND")) {
  console.log("⚠️  Edge Function 'api': not deployed");
  console.log("   → Run: supabase functions deploy api --no-verify-jwt");
} else if (fnErr) {
  console.log(`⚠️  Edge Function: ${fnErr.message}`);
} else {
  console.log("✅ Edge Function 'api' deployed");
}

console.log("\nDashboard: https://supabase.com/dashboard/project/njrrhckegbfqhwkqkzvw");
