#!/usr/bin/env node
/**
 * Compliance & auth flow smoke tests (API-level).
 * Usage: node scripts/compliance-test.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, service);
const testEmail = `compliance-test-${Date.now()}@zoomeats.test`;
const testPassword = `Test_${Date.now().toString(36)}!`;

const results = [];

function pass(name) { results.push({ name, ok: true }); console.log(`✓ ${name}`); }
function fail(name, err) { results.push({ name, ok: false, err: String(err) }); console.error(`✗ ${name}:`, err); }

async function invokeApi(token, path, method = "GET", body) {
  const res = await fetch(`${url}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${token || anon}`,
    },
    body: JSON.stringify({ path, method, body }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) throw new Error(data?.error || res.statusText);
  return data;
}

async function main() {
  console.log("ZoomEats compliance test\n");

  // 1. Sign up test user (email/password may be disabled — use admin session)
  let token;
  let userId;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: "Compliance Test" },
    });
    if (error) throw error;
    userId = data.user.id;

    const sessionRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    if (sessionRes.ok) {
      const sessionJson = await sessionRes.json();
      token = sessionJson.access_token;
    } else {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: testEmail,
      });
      if (linkErr) throw linkErr;
      const otp = linkData.properties?.email_otp;
      if (otp) {
        const otpRes = await fetch(`${url}/auth/v1/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anon },
          body: JSON.stringify({ type: "magiclink", email: testEmail, token: otp }),
        });
        const otpJson = await otpRes.json();
        token = otpJson.access_token;
      }
    }
    if (!token) throw new Error("Could not obtain session token (enable email auth or magic link in Supabase)");
    pass("Driver test user signup + login");
  } catch (e) {
    fail("Driver test user signup + login", e);
    return summarize();
  }

  // 2. Role assignment
  try {
    await invokeApi(token, "/auth/role", "POST", { role: "delivery" });
    const me = await invokeApi(token, "/auth/me");
    if (me.role !== "delivery") throw new Error(`expected delivery, got ${me.role}`);
    pass("Driver role assignment");
  } catch (e) {
    fail("Driver role assignment", e);
  }

  // 3. Compliance status — should block dashboard
  try {
    const status = await invokeApi(token, "/auth/compliance-status");
    if (status.can_access_dashboard) throw new Error("should not access dashboard before agreements");
    if (!status.redirect_to) throw new Error("expected redirect_to");
    pass("Compliance gate blocks dashboard before agreements");
  } catch (e) {
    fail("Compliance gate blocks dashboard before agreements", e);
  }

  // 4. Agreement definitions
  try {
    const defs = await invokeApi(token, "/agreements/me");
    if (!Array.isArray(defs) || defs.length < 5) throw new Error("expected driver agreements");
    pass("Agreement definitions load");
  } catch (e) {
    fail("Agreement definitions load", e);
  }

  // 5. Accept all agreements
  try {
    const defs = await invokeApi(token, "/agreements/me");
    const pending = defs.filter((d) => d.required && !d.accepted);
    const batch = pending.map((a) => ({
      agreement_type: a.type,
      typed_name: "Compliance Test",
      consent_checkbox: true,
      user_agent: "compliance-test",
      device: "script",
      browser: "node",
    }));
    await invokeApi(token, "/agreements/batch-accept", "POST", { agreements: batch });
    const status = await invokeApi(token, "/auth/compliance-status");
    if (status.missing_agreements?.length > 0) throw new Error("still missing agreements");
    pass("Batch agreement acceptance");
  } catch (e) {
    fail("Batch agreement acceptance", e);
  }

  // 6. Approval still pending
  try {
    const status = await invokeApi(token, "/auth/compliance-status");
    if (status.can_access_dashboard) throw new Error("should still need approval");
    pass("Approval gate after agreements");
  } catch (e) {
    fail("Approval gate after agreements", e);
  }

  // 7. Admin approve driver
  try {
    const { data: reviews } = await admin.from("compliance_reviews").select("*").eq("user_id", (await invokeApi(token, "/auth/me")).user_id).limit(1);
    const review = reviews?.[0];
    if (!review) throw new Error("no compliance review");

    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",")[0]?.trim();
    if (!adminEmail) throw new Error("set NEXT_PUBLIC_ADMIN_EMAILS for admin test");
    const { data: adminUsers } = await admin.from("users").select("user_id").eq("email", adminEmail).limit(1);
    const adminUserId = adminUsers?.[0]?.user_id;
    if (!adminUserId) throw new Error("admin user not found");

    const { data: adminSession } = await admin.auth.admin.generateLink({ type: "magiclink", email: adminEmail });
    // Use service role to approve directly
    await admin.from("drivers").update({ approval_status: "approved", active: true }).eq("user_id", review.user_id);
    await admin.from("users").update({ approval_status: "approved" }).eq("user_id", review.user_id);
    await admin.from("compliance_reviews").update({ status: "approved", approval_status: "approved" }).eq("review_id", review.review_id);

    const status = await invokeApi(token, "/auth/compliance-status");
    if (!status.can_access_dashboard) throw new Error("should access dashboard after approval");
    pass("Driver approval workflow");
  } catch (e) {
    fail("Driver approval workflow", e);
  }

  // 8. Unauthorized role access
  try {
    await invokeApi(token, "/vendor/restaurant", "GET");
    fail("Vendor API blocked for driver", "should have thrown");
  } catch {
    pass("Vendor API blocked for driver");
  }

  // Cleanup
  try {
    const me = await invokeApi(token, "/auth/me");
    await admin.auth.admin.deleteUser(me.user_id || userId);
    pass("Test user cleanup");
  } catch (e) {
    fail("Test user cleanup", e);
  }

  summarize();
}

function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
