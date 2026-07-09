#!/usr/bin/env node
/**
 * Print Google OAuth setup steps for Companion Mode / YouTube Music.
 * Usage: node scripts/print-google-music-oauth-setup.mjs [email-to-whitelist]
 */
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "njrrhckegbfqhwkqkzvw";
const CANONICAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://zoom-eats-delivery.vercel.app";
const SUPABASE_CALLBACK = `https://${PROJECT_REF}.supabase.co/auth/v1/callback`;

const testEmail = process.argv[2] || "alexanderrymelo@gmail.com";

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  Google OAuth — YouTube Music (via Supabase)                     ║
╚══════════════════════════════════════════════════════════════════╝

YouTube Music uses Supabase Google sign-in (same as ZoomEats login).
Redirect URI sent to Google (must be in Google Cloud Console):
  ${SUPABASE_CALLBACK}

── Step 1: Add Test user (required while app is in Testing) ──
https://console.cloud.google.com/apis/credentials/consent
→ Audience → Test users → Add users
→ Add: ${testEmail}

── Step 2: Verify redirect URI exists ──
https://console.cloud.google.com/apis/credentials
→ OAuth 2.0 Client IDs → your web client
→ Authorized redirect URIs must include:
  ${SUPABASE_CALLBACK}

── Step 3: Enable YouTube Data API v3 ──
https://console.cloud.google.com/apis/library/youtube.googleapis.com

── Step 4: Retry ──
${CANONICAL_APP_URL}/driver/companion → YouTube Music (Google)

── No Google? Use ZoomEats Ambient (works immediately) ──
`);
