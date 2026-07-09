#!/usr/bin/env node
/**
 * Print Google OAuth setup steps for Companion Mode / YouTube Music.
 * Usage: node scripts/print-google-music-oauth-setup.mjs [email-to-whitelist]
 */
const PROJECT_REF = "njrrhckegbfqhwkqkzvw";
const CANONICAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://zoom-eats-delivery.vercel.app";
const REDIRECT_URI = `${CANONICAL_APP_URL.replace(/\/$/, "")}/companion/oauth/callback`;

const testEmail = process.argv[2] || "your-email@gmail.com";

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  Google OAuth — Companion Mode / YouTube Music setup             ║
╚══════════════════════════════════════════════════════════════════╝

Error 403 access_denied means your Google OAuth app is in TESTING mode.
Only emails listed as Test users can approve YouTube access.

── Step 1: Open Google Cloud Console ──
https://console.cloud.google.com/apis/credentials/consent

── Step 2: Add Test user ──
OAuth consent screen → Audience → Test users → Add users
Add: ${testEmail}

── Step 3: Add redirect URI ──
APIs & Services → Credentials → OAuth 2.0 Client IDs → (your web client)
Authorized redirect URIs → Add:
  ${REDIRECT_URI}
  http://localhost:3000/companion/oauth/callback

── Step 4: Enable YouTube Data API v3 ──
https://console.cloud.google.com/apis/library/youtube.googleapis.com

── Step 5: Retry in ZoomEats ──
Companion Mode → YouTube Music (Google)

── Until verified / test user added ──
Use "ZoomEats Ambient" on Companion Mode (no Google sign-in required).

Supabase project: ${PROJECT_REF}
Production URL: ${CANONICAL_APP_URL}
Required redirect URI (copy exactly): ${REDIRECT_URI}
`);
