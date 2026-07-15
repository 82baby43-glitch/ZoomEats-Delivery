#!/usr/bin/env node
/**
 * Print Google OAuth branding setup so login shows "ZoomEats" / zoomeats.net
 * instead of supabase.co on the account picker.
 *
 * Usage: node scripts/print-google-oauth-branding.mjs
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.zoomeats.net";
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "njrrhckegbfqhwkqkzvw";

const HOSTS = [
  "https://www.zoomeats.net",
  "https://zoomeats.net",
  "https://driver.zoomeats.net",
  "https://restaurant.zoomeats.net",
  "https://www.zoomeats.com",
  "https://driver.zoomeats.com",
  "https://restaurant.zoomeats.com",
  "http://localhost:3000",
];

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  Google OAuth branding — show ZoomEats instead of supabase.co    ║
╚══════════════════════════════════════════════════════════════════╝

ZoomEats login uses direct Google OAuth on your domain (PKCE).
Google will show: "Choose an account to continue to zoomeats.net"

── 1. OAuth consent screen (App name + logo) ──
https://console.cloud.google.com/auth/branding
  App name:     ZoomEats
  User support: support@zoomeats.com (or your email)
  App logo:     Upload ZoomEats icon
  Authorized domains:
    zoomeats.net
    zoomeats.com

── 2. OAuth client — Authorized JavaScript origins ──
https://console.cloud.google.com/apis/credentials
→ Your Web client → Authorized JavaScript origins:
${HOSTS.map((h) => `  ${h}`).join("\n")}

── 3. OAuth client — Authorized redirect URIs ──
  Branded login (required):
${HOSTS.map((h) => `  ${h}/auth/callback/google`).join("\n")}

  YouTube Music / legacy Supabase path (keep if using companion mode):
  https://${PROJECT_REF}.supabase.co/auth/v1/callback

── 4. Publish app (when ready for all users) ──
OAuth consent screen → Publish app → Production

── 5. Env var (already on Vercel if auth:google was run) ──
  NEXT_PUBLIC_GOOGLE_CLIENT_ID=<same Web client ID as Supabase Google provider>

Primary site: ${SITE}
`);
