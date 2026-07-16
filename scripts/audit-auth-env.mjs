#!/usr/bin/env node
/**
 * Audit production auth environment variables and Supabase/Google wiring.
 * Usage: node scripts/audit-auth-env.mjs
 */
const PROJECT_REF = "njrrhckegbfqhwkqkzvw";
const EXPECTED_SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://zoomeats.net").replace(/\/$/, "");

const checks = [];

function pass(name, detail = "") {
  checks.push({ ok: true, name, detail });
}
function fail(name, detail = "") {
  checks.push({ ok: false, name, detail });
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (supabaseUrl?.includes(PROJECT_REF)) {
  pass("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl.replace(/https:\/\//, ""));
} else {
  fail("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl || "missing");
}

if (anonKey && anonKey.length > 20 && !anonKey.includes("placeholder")) {
  pass("NEXT_PUBLIC_SUPABASE_ANON_KEY", "set");
} else {
  fail("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey ? "invalid/placeholder" : "missing");
}

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("SUPABASE_SERVICE_ROLE_KEY exposed in client env", "must not be NEXT_PUBLIC_*");
} else {
  pass("No service role key in public env");
}

if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET?.startsWith("NEXT_PUBLIC")) {
  fail("Google secret must not be public");
} else {
  pass("Google OAuth secret not exposed client-side");
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
if (siteUrl === EXPECTED_SITE) {
  pass("NEXT_PUBLIC_SITE_URL", siteUrl);
} else {
  fail("NEXT_PUBLIC_SITE_URL", siteUrl || "missing — should be https://zoomeats.net");
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (token) {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const auth = await res.json();
    if (auth.site_url?.replace(/\/$/, "") === EXPECTED_SITE) {
      pass("Supabase site_url", auth.site_url);
    } else {
      fail("Supabase site_url", auth.site_url || "unknown");
    }
    const list = auth.uri_allow_list || "";
    if (list.includes(`${EXPECTED_SITE}/auth/callback`) && list.includes("https://www.zoomeats.net/**")) {
      pass("Supabase redirect allow list", "zoomeats.net + www");
    } else {
      fail("Supabase redirect allow list", "missing zoomeats.net callbacks");
    }
    if (auth.external_google_enabled) {
      pass("Supabase Google provider", "enabled");
    } else {
      fail("Supabase Google provider", "disabled");
    }
  } catch (e) {
    fail("Supabase auth config fetch", e.message);
  }
} else {
  fail("SUPABASE_ACCESS_TOKEN", "missing — cannot verify remote auth config");
}

console.log("\nZoomEats Auth Environment Audit\n");
for (const c of checks) {
  console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${failed ? `${failed} issue(s)` : "All checks passed"}\n`);
process.exit(failed ? 1 : 0);
