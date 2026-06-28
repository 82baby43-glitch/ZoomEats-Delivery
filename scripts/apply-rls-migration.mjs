#!/usr/bin/env node
/**
 * Apply Supabase RLS migration to remote project.
 *
 * Requires ONE of:
 *   SUPABASE_ACCESS_TOKEN  — Personal access token (https://supabase.com/dashboard/account/tokens)
 *   DATABASE_URL           — Postgres connection string (Dashboard → Database → Connection string)
 *
 * Usage:
 *   npm run db:migrate
 *   npm run db:migrate -- --file supabase/migrations/20260628_supabase_auth_rls.sql
 */
import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { resolve } from "path";

const PROJECT_REF = "njrrhckegbfqhwkqkzvw";
const DEFAULT_MIGRATION = "supabase/migrations/20260628_supabase_auth_rls.sql";

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

function getArg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

loadEnvLocal();

const migrationFile = resolve(getArg("--file", DEFAULT_MIGRATION));
const sql = readFileSync(migrationFile, "utf8");
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const databaseUrl = process.env.DATABASE_URL;

console.log(`Applying migration: ${migrationFile}`);
console.log(`Project: ${PROJECT_REF}`);

async function applyViaManagementApi() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${body}`);
  }
  console.log("✅ Migration applied via Supabase Management API");
  if (body && body !== "[]") console.log(body.slice(0, 500));
}

function applyViaCliDbUrl() {
  const result = spawnSync(
    "npx",
    ["supabase@latest", "db", "query", "--file", migrationFile, "--db-url", databaseUrl],
    { stdio: "inherit", env: process.env }
  );
  if (result.status !== 0) throw new Error("supabase db query failed");
  console.log("✅ Migration applied via DATABASE_URL");
}

async function applyViaCliLinked() {
  process.env.SUPABASE_ACCESS_TOKEN = accessToken;
  let link = spawnSync(
    "npx",
    ["supabase@latest", "link", "--project-ref", PROJECT_REF, "--yes"],
    { stdio: "inherit", env: process.env }
  );
  if (link.status !== 0) throw new Error("supabase link failed");

  let query = spawnSync(
    "npx",
    ["supabase@latest", "db", "query", "--file", migrationFile, "--linked"],
    { stdio: "inherit", env: process.env }
  );
  if (query.status !== 0) throw new Error("supabase db query --linked failed");
  console.log("✅ Migration applied via linked Supabase CLI");
}

try {
  if (databaseUrl) {
    applyViaCliDbUrl();
  } else if (accessToken) {
    try {
      await applyViaManagementApi();
    } catch (e) {
      console.warn("Management API failed, trying CLI:", e.message);
      await applyViaCliLinked();
    }
  } else {
    console.error(`
❌ Cannot apply migration — no database credentials found.

Add ONE of these to .env.local:

  SUPABASE_ACCESS_TOKEN=sbp_xxxx   # https://supabase.com/dashboard/account/tokens
  DATABASE_URL=postgresql://postgres.${PROJECT_REF}:YOUR_PASSWORD@aws-0-us-west-2.pooler.supabase.com:6543/postgres

Then run: npm run db:migrate
`);
    process.exit(1);
  }

  // Verify restaurants are readable
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const check = await fetch(`${url}/rest/v1/restaurants?select=restaurant_id,name&approved=eq.true&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const data = await check.json();
    if (check.ok) {
      console.log(`✅ Verified: anon can read restaurants (${Array.isArray(data) ? data.length : 0} row(s))`);
    } else {
      console.warn("⚠️  Post-migration check:", data);
    }
  }
} catch (e) {
  console.error("❌ Migration failed:", e.message);
  process.exit(1);
}
