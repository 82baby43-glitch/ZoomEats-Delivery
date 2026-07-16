#!/usr/bin/env node
/**
 * Sync Supabase Auth site URL + redirect allow list for zoomeats.net production.
 * Usage: NEXT_PUBLIC_SITE_URL=https://zoomeats.net node scripts/sync-auth-redirects.mjs
 */
const PROJECT_REF = "njrrhckegbfqhwkqkzvw";
const PRODUCTION = (process.env.NEXT_PUBLIC_SITE_URL || "https://zoomeats.net").replace(/\/$/, "");

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const redirectUrls = [
  `${PRODUCTION}/auth/callback`,
  `${PRODUCTION}/`,
  `${PRODUCTION}/driver/companion`,
  `${PRODUCTION}/companion/oauth/callback`,
  `${PRODUCTION}/**`,
  "https://www.zoomeats.net/auth/callback",
  "https://www.zoomeats.net/**",
  "https://driver.zoomeats.net/auth/callback",
  "https://driver.zoomeats.net/**",
  "https://restaurant.zoomeats.net/auth/callback",
  "https://restaurant.zoomeats.net/**",
  // Local development only
  "http://localhost:3000/auth/callback",
  "http://localhost:3000/**",
  "http://127.0.0.1:3000/auth/callback",
  "http://127.0.0.1:3000/**",
];

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    site_url: `${PRODUCTION}/`,
    uri_allow_list: [...new Set(redirectUrls)].join(","),
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Failed (${res.status}):`, body);
  process.exit(1);
}

console.log("✅ Supabase auth redirects updated");
console.log("   site_url:", `${PRODUCTION}/`);
console.log("   allow list entries:", redirectUrls.length);
