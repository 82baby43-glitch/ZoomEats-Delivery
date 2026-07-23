#!/usr/bin/env node
/**
 * Generate/set EDGE_FUNCTION_SECRET in Supabase Edge secrets + Vault,
 * apply trigger migration, and deploy protected internal edge functions.
 *
 * Usage:
 *   npm run edge:secret-setup
 *   # or with an existing secret:
 *   EDGE_FUNCTION_SECRET=your-secret npm run edge:secret-setup
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "njrrhckegbfqhwkqkzvw";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnvLocal();

function generateSecret() {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

async function runSql(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN required for database updates");
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function upsertVaultSecret(secret) {
  const escaped = secret.replace(/'/g, "''");
  const existing = await runSql(
    `select id::text from vault.secrets where name = 'EDGE_FUNCTION_SECRET' limit 1`
  );
  if (Array.isArray(existing) && existing[0]?.id) {
    await runSql(`select vault.update_secret('${existing[0].id}'::uuid, '${escaped}')`);
    console.log("✓ Updated EDGE_FUNCTION_SECRET in Supabase Vault");
  } else {
    await runSql(
      `select vault.create_secret('${escaped}', 'EDGE_FUNCTION_SECRET', 'Internal edge function auth (dispatch, offer, routing)')`
    );
    console.log("✓ Created EDGE_FUNCTION_SECRET in Supabase Vault");
  }
}

async function applyTriggerMigration() {
  const sql = readFileSync(
    resolve("supabase/migrations/20260770_edge_function_auth_triggers.sql"),
    "utf8"
  );
  await runSql(sql);
  console.log("✓ Applied edge function auth trigger migration");
}

function setEdgeSecrets(secret) {
  const result = spawnSync(
    "supabase",
    ["secrets", "set", `EDGE_FUNCTION_SECRET=${secret}`, "--project-ref", PROJECT_REF],
    { stdio: "inherit", encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error("supabase secrets set failed");
  console.log("✓ Set EDGE_FUNCTION_SECRET in Supabase Edge secrets");
}

function deployFunctions() {
  const fns = [
    ["api"],
    ["stripe-webhook", "--no-verify-jwt"],
    ["dispatch-order", "--no-verify-jwt"],
    ["offer-order", "--no-verify-jwt"],
    ["routing-engine", "--no-verify-jwt"],
    ["reconcile-payments", "--no-verify-jwt"],
  ];
  for (const args of fns) {
    const name = args[0];
    const flags = args.slice(1);
    console.log(`\nDeploying ${name}...`);
    const result = spawnSync(
      "supabase",
      ["functions", "deploy", name, ...flags, "--project-ref", PROJECT_REF],
      { stdio: "inherit", encoding: "utf8" }
    );
    if (result.status !== 0) throw new Error(`deploy ${name} failed`);
  }
  console.log("\n✓ All edge functions deployed");
}

async function verifyProtection(secret) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const url = `${base.replace(/\/$/, "")}/functions/v1/dispatch-order`;

  const unauth = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ order_id: "ord_probe" }),
  });
  if (unauth.status !== 401) {
    console.warn(`⚠️  dispatch-order without auth returned ${unauth.status} (expected 401)`);
  } else {
    console.log("✓ dispatch-order rejects unauthenticated requests");
  }

  const authed = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ order_id: "ord_probe" }),
  });
  if (authed.status === 401) {
    console.warn("⚠️  dispatch-order still returns 401 with secret — redeploy may need a minute to propagate");
  } else {
    console.log(`✓ dispatch-order accepts authenticated internal call (status ${authed.status})`);
  }
}

async function main() {
  const secret = process.env.EDGE_FUNCTION_SECRET || generateSecret();
  const generated = !process.env.EDGE_FUNCTION_SECRET;

  console.log("\n=== ZoomEats Edge Function Secret Setup ===\n");
  console.log(`Project: ${PROJECT_REF}`);
  if (generated) {
    console.log("Generated new EDGE_FUNCTION_SECRET (store in your password manager)\n");
  }

  setEdgeSecrets(secret);
  await upsertVaultSecret(secret);
  await applyTriggerMigration();
  deployFunctions();
  await verifyProtection(secret);

  console.log("\n=== Done ===");
  if (generated) {
    console.log("\nSave this secret securely (also in Supabase Vault + Edge secrets):");
    console.log(`EDGE_FUNCTION_SECRET=${secret}`);
  }
  console.log("\nRe-run: npm run security:audit\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
