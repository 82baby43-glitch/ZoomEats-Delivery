#!/usr/bin/env node
/**
 * Register (or verify) Stripe webhook endpoint for ZoomEats Supabase edge function.
 * Sets STRIPE_WEBHOOK_SECRET in Supabase when a new endpoint is created.
 *
 * Usage:
 *   export STRIPE_SECRET_KEY=sk_test_...
 *   export SUPABASE_ACCESS_TOKEN=...
 *   npm run stripe:webhook-register
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "njrrhckegbfqhwkqkzvw";
const EVENTS = [
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
];

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

const stripeKey =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_API_KEY ||
  process.env.Stripe_Secret_Key ||
  "";

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  `https://${PROJECT_REF}.supabase.co`;

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!stripeKey) {
  console.error("Missing STRIPE_SECRET_KEY / STRIPE_API_KEY");
  process.exit(1);
}

const webhookUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/stripe-webhook`;

async function stripeForm(path, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

async function listWebhooks() {
  const res = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data.data || [];
}

async function setSupabaseSecret(secret) {
  if (!accessToken) {
    console.warn("No SUPABASE_ACCESS_TOKEN — set STRIPE_WEBHOOK_SECRET manually in Supabase:");
    console.warn(`  STRIPE_WEBHOOK_SECRET=${secret}`);
    return;
  }
  const result = spawnSync(
    "supabase",
    ["secrets", "set", `STRIPE_WEBHOOK_SECRET=${secret}`, `Stripe_Webhook_Secret=${secret}`, "--project-ref", PROJECT_REF],
    { stdio: "inherit", encoding: "utf8", env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken } }
  );
  if (result.status !== 0) throw new Error("supabase secrets set failed");
}

async function main() {
  console.log(`Webhook URL: ${webhookUrl}`);

  const existing = (await listWebhooks()).find((w) => w.url === webhookUrl);
  if (existing) {
    console.log(`✅ Webhook already registered (${existing.id}, status=${existing.status})`);
    if (existing.secret) {
      await setSupabaseSecret(existing.secret);
    } else {
      console.warn("Existing endpoint has no secret in list response. Create a new signing secret in Stripe Dashboard if needed.");
    }
    return;
  }

  const params = {
    url: webhookUrl,
    description: "ZoomEats Supabase payments",
    "enabled_events[]": EVENTS,
  };

  console.log("Creating Stripe webhook endpoint…");
  const created = await stripeForm("webhook_endpoints", params);
  console.log(`✅ Created webhook ${created.id}`);

  if (created.secret) {
    await setSupabaseSecret(created.secret);
    console.log("✅ STRIPE_WEBHOOK_SECRET pushed to Supabase");
  }

  console.log("\nRedeploying stripe-webhook function…");
  const deploy = spawnSync("supabase", ["functions", "deploy", "stripe-webhook", "--no-verify-jwt", "--project-ref", PROJECT_REF], {
    stdio: "inherit",
    encoding: "utf8",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
  });
  process.exit(deploy.status ?? 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
