#!/usr/bin/env node
/**
 * Sync Supabase Auth redirect URLs for production + custom domains + Vercel previews.
 * Usage: node scripts/sync-auth-redirects.mjs
 */
const PROJECT_REF = "njrrhckegbfqhwkqkzvw";
const PRODUCTION = process.env.NEXT_PUBLIC_SITE_URL || "https://www.zoomeats.net";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const bases = [PRODUCTION];
const paths = ["/auth/callback", "/", "/driver/companion", "/companion/oauth/callback"];

const redirectUrls = [
  ...bases.flatMap((base) => paths.map((p) => `${base}${p}`)),
  "http://localhost:3000/auth/callback",
  "http://localhost:3000/",
  "http://localhost:3000/driver/companion",
  "http://localhost:3000/companion/oauth/callback",
  // Custom PWA subdomains (.com legacy + .net primary)
  "https://www.zoomeats.net/auth/callback",
  "https://zoomeats.net/auth/callback",
  "https://driver.zoomeats.net/auth/callback",
  "https://restaurant.zoomeats.net/auth/callback",
  "https://www.zoomeats.net/**",
  "https://driver.zoomeats.net/**",
  "https://restaurant.zoomeats.net/**",
  "https://zoomeats.com/auth/callback",
  "https://www.zoomeats.com/auth/callback",
  "https://driver.zoomeats.com/auth/callback",
  "https://restaurant.zoomeats.com/auth/callback",
  "https://zoomeats.com/**",
  "https://driver.zoomeats.com/**",
  "https://restaurant.zoomeats.com/**",
  // Vercel preview deployments
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
    uri_allow_list: [...new Set(redirectUrls)].join(","),
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Failed (${res.status}):`, body);
  process.exit(1);
}

console.log("✅ Supabase auth redirects updated");
console.log("   production URL:", `${PRODUCTION}/`);
