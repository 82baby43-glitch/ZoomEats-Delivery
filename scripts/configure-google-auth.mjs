#!/usr/bin/env node
/**
 * Enable Google OAuth on Supabase Auth via Management API.
 *
 * Requires in .env.local:
 *   SUPABASE_ACCESS_TOKEN
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *
 * Usage: npm run auth:google
 */
import { readFileSync, existsSync } from "fs";

const PROJECT_REF = "njrrhckegbfqhwkqkzvw";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

loadEnvLocal();

const token = process.env.SUPABASE_ACCESS_TOKEN;
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!token || !clientId || !clientSecret) {
  console.error(`
❌ Missing credentials in .env.local:

  SUPABASE_ACCESS_TOKEN=sbp_xxx          # https://supabase.com/dashboard/account/tokens
  GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=GOCSPX-xxx

Manual setup (no token needed):
  1. Supabase Dashboard → Authentication → Providers → Google → Enable
  2. Paste Client ID + Client Secret
  3. In Google Cloud Console, add authorized redirect URI:
     https://${PROJECT_REF}.supabase.co/auth/v1/callback
`);
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    external_google_enabled: true,
    external_google_client_id: clientId,
    external_google_secret: clientSecret,
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`❌ Failed (${res.status}):`, body);
  process.exit(1);
}

console.log("✅ Google OAuth enabled on Supabase Auth");
console.log(`   Redirect URI (add in Google Cloud Console if not set):`);
console.log(`   https://${PROJECT_REF}.supabase.co/auth/v1/callback`);
