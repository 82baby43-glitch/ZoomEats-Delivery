#!/usr/bin/env node
/**
 * Sync Supabase Auth redirect URLs for production + Vercel previews.
 * Usage: node scripts/sync-auth-redirects.mjs
 */
const PROJECT_REF = "njrrhckegbfqhwkqkzvw";
const PRODUCTION = "https://zoom-eats-delivery.vercel.app";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const redirectUrls = [
  `${PRODUCTION}/auth/callback`,
  `${PRODUCTION}/`,
  "http://localhost:3000/auth/callback",
  "http://localhost:3000/",
  // Vercel preview deployments (team + branch URLs)
  "https://*.vercel.app/auth/callback",
  "https://*-*-*.vercel.app/auth/callback",
  "https://zoom-eats-delivery-82baby43-6212s-projects.vercel.app/auth/callback",
  "https://zoom-eats-delivery-82baby43-6212s-projects.vercel.app/**",
];

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    site_url: `${PRODUCTION}/`,
    uri_allow_list: redirectUrls.join(","),
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Failed (${res.status}):`, body);
  process.exit(1);
}

console.log("✅ Supabase auth redirects updated");
console.log("   site_url:", `${PRODUCTION}/`);
console.log("   callbacks:", redirectUrls.filter((u) => u.includes("callback")).join(", "));
