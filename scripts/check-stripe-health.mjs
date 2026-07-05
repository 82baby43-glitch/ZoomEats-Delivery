#!/usr/bin/env node
/**
 * Verify ZoomEats Stripe + Supabase payment integration health.
 * Usage: npm run stripe:health
 *
 * Loads .env.local when present. Requires STRIPE_SECRET_KEY (or rk_test_ restricted key).
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "njrrhckegbfqhwkqkzvw";
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook`;
const EXPECTED_EVENTS = [
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
  process.env.Stripe_Api_Token ||
  "";

const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET ||
  process.env.Stripe_Webhook_Secret ||
  "";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let failures = 0;
const warn = (msg) => console.log(`⚠️  ${msg}`);
const ok = (msg) => console.log(`✅ ${msg}`);
const fail = (msg) => {
  console.log(`❌ ${msg}`);
  failures += 1;
};

console.log("ZoomEats Stripe health check\n");

if (!stripeKey) {
  fail("Missing STRIPE_SECRET_KEY — set in env or .env.local");
} else {
  const keyType = stripeKey.startsWith("sk_")
    ? "secret"
    : stripeKey.startsWith("rk_")
      ? "restricted"
      : "unknown";
  console.log(`Stripe key type: ${keyType}`);
  if (keyType === "restricted") {
    warn("Restricted keys (rk_test_) may block some Dashboard/Connect APIs — prefer sk_test_ in Supabase secrets");
  }

  const acctRes = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const acct = await acctRes.json();
  if (!acctRes.ok) {
    fail(`Stripe API unreachable: ${acct.error?.message ?? acctRes.status}`);
    if (acct.error?.message?.includes("does not have access")) {
      warn("API key belongs to a different Stripe account than the Dashboard you're viewing");
      warn("Switch Dashboard to the account that owns this key (ZoomEats sandbox: acct_1TlLuQIkHQ6D21aO)");
    }
  } else {
    const name =
      acct.settings?.dashboard?.display_name ||
      acct.business_profile?.name ||
      acct.email ||
      acct.id;
    ok(`Stripe account: ${acct.id} (${name})`);
    console.log(`   Mode: ${acct.charges_enabled !== undefined ? (acct.livemode ? "LIVE" : "TEST") : "test"}`);
  }

  const listRes = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=20", {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const list = await listRes.json();
  if (!listRes.ok) {
    fail(`Cannot list webhooks: ${list.error?.message ?? listRes.status}`);
  } else {
    const hook = (list.data || []).find((w) => w.url === WEBHOOK_URL);
    if (!hook) {
      fail(`No webhook for ${WEBHOOK_URL}`);
      console.log("   → Run: npm run stripe:webhook");
    } else {
      ok(`Webhook endpoint: ${hook.id}`);
      console.log(`   URL: ${hook.url}`);
      console.log(`   Status: ${hook.status}`);
      const missing = EXPECTED_EVENTS.filter((e) => !hook.enabled_events.includes(e));
      if (missing.length) {
        fail(`Webhook missing events: ${missing.join(", ")}`);
      } else {
        ok(`Webhook events: ${hook.enabled_events.join(", ")}`);
      }
      console.log(`   Dashboard: https://dashboard.stripe.com/test/webhooks/${hook.id}`);
    }
  }
}

if (!webhookSecret) {
  warn("STRIPE_WEBHOOK_SECRET not in local env — verify it is set in Supabase Edge secrets");
} else {
  ok("Local webhook signing secret configured");
}

if (!supabaseUrl || !anonKey) {
  warn("Missing NEXT_PUBLIC_SUPABASE_URL or anon key — skipping Supabase checks");
} else {
  const supabase = createClient(supabaseUrl, anonKey);

  const { data: healthData, error: fnErr } = await supabase.functions.invoke("api", {
    body: { path: "/stripe/health", method: "GET" },
  });
  if (fnErr) {
    warn(`Edge /stripe/health: ${fnErr.message}`);
  } else if (healthData?.status) {
    const checks = healthData.checks ?? {};
    if (healthData.status === "healthy") {
      ok(`Edge /stripe/health: healthy (${checks.account_id ?? "stripe ok"})`);
    } else {
      warn(`Edge /stripe/health: ${healthData.status}`);
      if (!checks.webhook_secret_configured) warn("Supabase missing STRIPE_WEBHOOK_SECRET");
      if (!checks.stripe_reachable) warn(`Stripe error: ${checks.stripe_error ?? "unreachable"}`);
    }
  } else {
    ok("Edge Function api reachable");
  }

  const probe = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (probe.status === 400) {
    ok("stripe-webhook edge function deployed (rejects unsigned payloads)");
  } else if (probe.status === 401) {
    warn("stripe-webhook returned 401 — ensure deployed with --no-verify-jwt");
  } else {
    warn(`stripe-webhook probe returned ${probe.status}`);
  }
}

if (serviceKey && supabaseUrl) {
  const db = createClient(supabaseUrl, serviceKey);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: logCount, error: logErr } = await db
    .from("payment_logs")
    .select("*", { count: "exact", head: true })
    .gte("processed_at", since);

  if (logErr) {
    warn(`payment_logs query: ${logErr.message}`);
  } else {
    ok(`payment_logs (24h): ${logCount ?? 0} webhook event(s) processed`);
  }

  const { count: stuckCount, error: stuckErr } = await db
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("payment_status", "paid")
    .eq("status", "pending_payment");

  if (!stuckErr && stuckCount > 0) {
    warn(`${stuckCount} paid order(s) still have status=pending_payment — deploy latest webhook fix`);
  } else if (!stuckErr) {
    ok("No paid orders stuck in pending_payment");
  }
} else {
  warn("SUPABASE_SERVICE_ROLE_KEY not set — skipping DB payment_logs check");
}

console.log(`\nSupabase project: https://supabase.com/dashboard/project/${PROJECT_REF}`);
console.log(`Production app: https://zoom-eats-delivery.vercel.app`);

process.exit(failures > 0 ? 1 : 0);
