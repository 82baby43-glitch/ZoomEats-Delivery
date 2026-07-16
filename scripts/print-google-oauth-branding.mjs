#!/usr/bin/env node
/**
 * Google OAuth setup for Supabase Auth (login via supabase.auth.signInWithOAuth).
 * Google redirect URI is Supabase callback — NOT zoomeats.net directly.
 *
 * Usage: node scripts/print-google-oauth-branding.mjs
 */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://zoomeats.net").replace(/\/$/, "");
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "njrrhckegbfqhwkqkzvw";
const SUPABASE_CALLBACK = `https://${PROJECT_REF}.supabase.co/auth/v1/callback`;

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  ZoomEats Google OAuth (Supabase Auth)                           ║
╚══════════════════════════════════════════════════════════════════╝

Login flow: App → Supabase → Google → Supabase → ${SITE}/auth/callback

── 1. OAuth consent screen ──
https://console.cloud.google.com/auth/branding
  App name: ZoomEats
  Authorized domains: zoomeats.net

── 2. OAuth client — Authorized redirect URIs (required) ──
https://console.cloud.google.com/apis/credentials
  ${SUPABASE_CALLBACK}

── 3. OAuth client — Authorized JavaScript origins ──
  ${SITE}
  https://www.zoomeats.net
  https://driver.zoomeats.net
  https://restaurant.zoomeats.net
  http://localhost:3000

── 4. Supabase Auth (run: npm run auth:redirects) ──
  site_url: ${SITE}/
  allow: ${SITE}/**, https://www.zoomeats.net/**

── 5. Vercel production env (public only) ──
  NEXT_PUBLIC_SITE_URL=${SITE}
  NEXT_PUBLIC_SUPABASE_URL=https://${PROJECT_REF}.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
  (Do NOT set GOOGLE_CLIENT_SECRET or service role key as NEXT_PUBLIC_*)
`);
