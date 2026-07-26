#!/usr/bin/env node
/**
 * Generate a browser console injection script for Licensed Dispensary onboarding QA.
 *
 * Usage:
 *   node scripts/generate-dispensary-inject.mjs > /tmp/inject-dispensary-live.js
 *   # Paste /tmp/inject-dispensary-live.js into DevTools on https://www.zoomeats.net
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.
 * Optional: DISPENSARY_TEST_EMAIL / DISPENSARY_TEST_PASSWORD (creates a throwaway vendor if unset).
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, service);
const testEmail = process.env.DISPENSARY_TEST_EMAIL || `dispensary-qa-${Date.now()}@zoomeats.test`;
const testPassword = process.env.DISPENSARY_TEST_PASSWORD || `Test_${Date.now().toString(36)}!`;

async function getSessionToken() {
  const { error: createErr } = await admin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: { full_name: "Dispensary QA", role: "restaurant" },
  });
  if (createErr && !/already|registered/i.test(createErr.message)) throw createErr;

  const sessionRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  if (!sessionRes.ok) {
    const body = await sessionRes.text();
    throw new Error(`Could not sign in test user: ${body}`);
  }
  const session = await sessionRes.json();
  return session;
}

function buildInjectScript(session) {
  const projectRef = new URL(url).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const expiresAt = Math.floor(Date.now() / 1000) + (session.expires_in || 3600);

  return `(async () => {
  const storageKey = ${JSON.stringify(storageKey)};
  const session = {
    access_token: ${JSON.stringify(session.access_token)},
    refresh_token: ${JSON.stringify(session.refresh_token)},
    expires_in: ${session.expires_in || 3600},
    expires_at: ${expiresAt},
    token_type: "bearer",
    user: ${JSON.stringify(session.user)},
  };
  localStorage.setItem(storageKey, JSON.stringify(session));

  const apiBase = ${JSON.stringify(url)} + "/functions/v1/api";
  const anonKey = ${JSON.stringify(anon)};

  async function api(path, method = "GET", body) {
    const res = await fetch(apiBase, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ path, method, body }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) throw new Error(data?.error || res.statusText);
    return data;
  }

  try {
    await api("/auth/role", "POST", { role: "vendor" });
    await api("/onboarding/restaurant", "POST", {
      merchant_category_slug: "licensed_dispensary",
      status: "category_selected",
    });
  } catch (err) {
    console.warn("[inject-dispensary] preflight warning:", err);
  }

  location.assign("/restaurant/onboarding?category=licensed_dispensary");
})();`;
}

async function main() {
  const session = await getSessionToken();
  const script = buildInjectScript(session);
  const outPath = process.argv[2] || "/tmp/inject-dispensary-live.js";
  writeFileSync(outPath, script, "utf8");
  console.error(`Wrote injection script for ${testEmail} → ${outPath}`);
  console.log(script);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
