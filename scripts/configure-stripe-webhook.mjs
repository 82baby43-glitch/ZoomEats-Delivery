#!/usr/bin/env node
/**
 * Create or verify Stripe webhook endpoint for ZoomEats Supabase.
 * Usage: npm run stripe:webhook
 *
 * Requires STRIPE_SECRET_KEY (or Stripe_Api_Token) and SUPABASE_ACCESS_TOKEN via env.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "njrrhckegbfqhwkqkzvw";
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook`;
const EVENTS = [
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
];

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

loadDotEnvLocal();

const stripeKey =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_API_KEY ||
  process.env.Stripe_Api_Token ||
  "";

if (!stripeKey) {
  console.error("Missing STRIPE_SECRET_KEY / Stripe_Api_Token");
  process.exit(1);
}

const listRes = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=20", {
  headers: { Authorization: `Bearer ${stripeKey}` },
});
const list = await listRes.json();
const existing = (list.data || []).find((w) => w.url === WEBHOOK_URL);

let endpoint = existing;
let secret = null;

if (existing) {
  console.log(`✅ Webhook already exists: ${existing.id}`);
  console.log(`   URL: ${existing.url}`);
  console.log(`   Events: ${existing.enabled_events.join(", ")}`);
  console.log(`   Mode: ${existing.livemode ? "LIVE" : "TEST"}`);
  console.log("\n⚠️  Signing secret is only shown when the endpoint is created.");
  console.log("   If deliveries fail, delete this endpoint in Stripe Dashboard and re-run this script.");
} else {
  const body = new URLSearchParams();
  body.set("url", WEBHOOK_URL);
  body.set("description", "ZoomEats Supabase stripe-webhook");
  for (const ev of EVENTS) body.append("enabled_events[]", ev);

  const createRes = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  endpoint = await createRes.json();
  if (!createRes.ok) {
    console.error("Failed to create webhook:", endpoint);
    process.exit(1);
  }
  secret = endpoint.secret;
  console.log(`✅ Created webhook: ${endpoint.id}`);
  console.log(`   URL: ${endpoint.url}`);
  console.log(`   Mode: ${endpoint.livemode ? "LIVE" : "TEST"}`);
}

if (secret) {
  const args = [
    "secrets",
    "set",
    `STRIPE_WEBHOOK_SECRET=${secret}`,
    `Stripe_Webhook_Secret=${secret}`,
    `STRIPE_API_KEY=${stripeKey}`,
    `STRIPE_SECRET_KEY=${stripeKey}`,
    "--project-ref",
    PROJECT_REF,
  ];
  console.log("\nSyncing signing secret to Supabase...");
  const result = spawnSync("supabase", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);

  console.log("\nDeploying stripe-webhook...");
  spawnSync(
    "supabase",
    ["functions", "deploy", "stripe-webhook", "--no-verify-jwt", "--project-ref", PROJECT_REF],
    { stdio: "inherit" }
  );
}

console.log(`\n📋 Stripe Dashboard (TEST mode): https://dashboard.stripe.com/test/webhooks`);
if (endpoint?.id) {
  console.log(`   Direct link: https://dashboard.stripe.com/test/webhooks/${endpoint.id}`);
}
