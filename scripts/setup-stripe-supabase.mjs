#!/usr/bin/env node
/**
 * Push Stripe env vars from the shell / .env.local into Supabase Edge Function secrets.
 * Never commit real keys — run locally or in CI with env vars set.
 *
 * Usage:
 *   export STRIPE_SECRET_KEY=sk_test_...
 *   export STRIPE_WEBHOOK_SECRET=whsec_...
 *   export STRIPE_PUBLISHABLE_KEY=pk_test_...
 *   npm run stripe:supabase
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

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

const secretKey =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_API_KEY ||
  process.env.Stripe_Secret_Key ||
  "";

const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET ||
  process.env.Stripe_Webhook_Secret ||
  "";

const publishableKey =
  process.env.STRIPE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  "";

if (!secretKey) {
  console.error("Missing STRIPE_SECRET_KEY (or STRIPE_API_KEY). Set in env or .env.local");
  process.exit(1);
}

const pairs = [
  ["STRIPE_API_KEY", secretKey],
  ["STRIPE_SECRET_KEY", secretKey],
  ["Stripe_Secret_Key", secretKey],
];

if (webhookSecret) {
  pairs.push(["STRIPE_WEBHOOK_SECRET", webhookSecret]);
  pairs.push(["Stripe_Webhook_Secret", webhookSecret]);
} else {
  console.warn("No STRIPE_WEBHOOK_SECRET — webhook will use existing Stripe_Webhook_Secret in Supabase if set");
}

if (publishableKey) {
  pairs.push(["STRIPE_PUBLISHABLE_KEY", publishableKey]);
  pairs.push(["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", publishableKey]);
}

const args = [
  "secrets",
  "set",
  ...pairs.map(([k, v]) => `${k}=${v}`),
  "--project-ref",
  PROJECT_REF,
];

console.log(`Setting ${pairs.length} Stripe secret(s) on project ${PROJECT_REF}...`);
const result = spawnSync("supabase", args, { stdio: "inherit", encoding: "utf8" });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("\nDeploying Stripe-related edge functions...");
const deploy = spawnSync(
  "npm",
  ["run", "functions:deploy"],
  { stdio: "inherit", encoding: "utf8", cwd: process.cwd() }
);
process.exit(deploy.status ?? 0);
