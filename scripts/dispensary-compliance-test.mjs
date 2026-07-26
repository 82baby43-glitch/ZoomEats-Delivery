#!/usr/bin/env node
/**
 * Licensed dispensary compliance approval flow (API-level integration tests).
 * Usage: npm run dispensary:compliance:test
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = (process.env.ADMIN_EMAILS || "")
  .split(",")[0]
  ?.trim();

if (!url || !anon || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, service);
const stamp = Date.now();
const vendorEmail = `dispensary-compliance-${stamp}@zoomeats.test`;
const vendorPassword = `Test_${stamp.toString(36)}!`;
const businessName = `Compliance Dispensary ${stamp}`;

const results = [];
const createdUserIds = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`✓ ${name}`);
}

function fail(name, err) {
  results.push({ name, ok: false, err: String(err) });
  console.error(`✗ ${name}:`, err);
}

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
  if (!res.ok || data?.error) {
    const err = new Error(data?.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function getSessionToken(email, password) {
  const sessionRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ email, password }),
  });
  if (sessionRes.ok) {
    const sessionJson = await sessionRes.json();
    return sessionJson.access_token;
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw linkErr;
  const otp = linkData.properties?.email_otp;
  if (!otp) throw new Error("Could not obtain session token");
  const otpRes = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ type: "magiclink", email, token: otp }),
  });
  const otpJson = await otpRes.json();
  if (!otpJson.access_token) throw new Error("Magic link verify failed");
  return otpJson.access_token;
}

async function ensureTestRestaurant(userId) {
  const now = new Date().toISOString();
  const restaurantId = `rest_disp_${stamp}`;
  const { error } = await admin.from("restaurants").upsert(
    {
      restaurant_id: restaurantId,
      owner_id: userId,
      name: businessName,
      description: "",
      cuisine: "",
      approved: false,
      active: false,
      accepting_orders: false,
      merchant_category_slug: "licensed_dispensary",
      business_category: "licensed_dispensary",
      rating: 4.6,
      delivery_time_min: 30,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "restaurant_id" }
  );
  if (error) throw error;
  return restaurantId;
}

async function createVendorUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: vendorEmail,
    password: vendorPassword,
    email_confirm: true,
    user_metadata: { full_name: "Dispensary Compliance Test" },
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  const token = await getSessionToken(vendorEmail, vendorPassword);
  await invokeApi(token, "/auth/role", "POST", { role: "vendor" });
  return { token, userId: data.user.id };
}

async function getAdminToken() {
  if (!adminEmail) throw new Error("set ADMIN_EMAILS for admin approval test");
  const { data: adminUsers } = await admin.from("users").select("user_id, role").eq("email", adminEmail).limit(1);
  const adminUser = adminUsers?.[0];
  if (!adminUser) throw new Error(`admin user not found for ${adminEmail}`);
  if (adminUser.role !== "admin") {
    await admin.from("users").update({ role: "admin", approval_status: "approved" }).eq("user_id", adminUser.user_id);
  }
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: adminEmail,
  });
  if (linkErr) throw linkErr;
  const otp = linkData?.properties?.email_otp;
  if (!otp) throw new Error("Could not obtain admin session");
  const otpRes = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ type: "magiclink", email: adminEmail, token: otp }),
  });
  const otpJson = await otpRes.json();
  if (!otpJson.access_token) throw new Error("Admin magic link verify failed");
  return otpJson.access_token;
}

function dispensaryOnboardingPayload(overrides = {}) {
  const expiration = new Date();
  expiration.setFullYear(expiration.getFullYear() + 1);
  return {
    business_name: businessName,
    merchant_category_slug: "licensed_dispensary",
    business_license_number: `LIC-${stamp}`,
    license_expiration_date: expiration.toISOString().slice(0, 10),
    licensing_responsibility_confirmed: true,
    delivery_agreement_accepted: true,
    age_restricted_confirmed: true,
    business_address: "123 Compliance Ave, Test City, CA 90210",
    status: "submitted",
    verification_status: "documents_submitted",
    ...overrides,
  };
}

async function getRestaurantId(userId) {
  const { data } = await admin
    .from("restaurants")
    .select("restaurant_id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.restaurant_id || null;
}

async function isPubliclyListed(restaurantId) {
  const list = await invokeApi(anon, "/restaurants", "GET");
  return Array.isArray(list) && list.some((r) => r.restaurant_id === restaurantId);
}

async function getPublicDetail(restaurantId) {
  try {
    return await invokeApi(anon, `/restaurants/${restaurantId}`, "GET");
  } catch (err) {
    return { error: err };
  }
}

async function cleanup(userId) {
  if (!userId) return;
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("restaurant_id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (restaurant?.restaurant_id) {
    await admin.from("merchant_compliance_profiles").delete().eq("merchant_id", restaurant.restaurant_id);
    await admin.from("menu_items").delete().eq("restaurant_id", restaurant.restaurant_id);
    await admin.from("restaurants").delete().eq("restaurant_id", restaurant.restaurant_id);
  }
  await admin.from("restaurant_onboarding").delete().eq("user_id", userId);
  await admin.from("compliance_reviews").delete().eq("user_id", userId);
  await admin.from("agreement_acceptances").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}

async function main() {
  console.log("ZoomEats dispensary compliance test\n");

  let vendorToken;
  let vendorUserId;
  let restaurantId;
  let adminToken;

  try {
    ({ token: vendorToken, userId: vendorUserId } = await createVendorUser());
    pass("Dispensary vendor signup + role assignment");
  } catch (e) {
    fail("Dispensary vendor signup + role assignment", e);
    return summarize();
  }

  try {
    await invokeApi(vendorToken, "/onboarding/restaurant", "POST", dispensaryOnboardingPayload({
      licensing_responsibility_confirmed: false,
    }));
    fail("Onboarding requires licensing acknowledgment", "should have thrown");
  } catch (e) {
    if (String(e.message || e).includes("Licensing responsibility")) {
      pass("Onboarding requires licensing acknowledgment");
    } else {
      fail("Onboarding requires licensing acknowledgment", e);
    }
  }

  try {
    restaurantId = await ensureTestRestaurant(vendorUserId);
    const onboarding = await invokeApi(
      vendorToken,
      "/onboarding/restaurant",
      "POST",
      dispensaryOnboardingPayload()
    );
    if (onboarding?.merchant_category_slug !== "licensed_dispensary") {
      throw new Error(`expected licensed_dispensary, got ${onboarding?.merchant_category_slug}`);
    }
    const linkedRestaurantId = await getRestaurantId(vendorUserId);
    if (!linkedRestaurantId) throw new Error("restaurant stub not linked");
    restaurantId = linkedRestaurantId;
    pass("Dispensary onboarding submission");
  } catch (e) {
    fail("Dispensary onboarding submission", e);
    await cleanup(vendorUserId);
    return summarize();
  }

  try {
    const { data: profile } = await admin
      .from("merchant_compliance_profiles")
      .select("*")
      .eq("merchant_id", restaurantId)
      .maybeSingle();
    if (!profile) throw new Error("compliance profile missing");
    if (profile.merchant_category !== "licensed_dispensary") throw new Error("wrong category");
    if (profile.license_number !== `LIC-${stamp}`) throw new Error("license not synced");
    if (profile.verification_status !== "documents_submitted") {
      throw new Error(`expected documents_submitted, got ${profile.verification_status}`);
    }
    pass("merchant_compliance_profiles sync on onboarding");
  } catch (e) {
    fail("merchant_compliance_profiles sync on onboarding", e);
  }

  try {
    const compliance = await invokeApi(vendorToken, "/vendor/compliance", "GET");
    if (!compliance?.compliance_profile) throw new Error("vendor compliance profile missing");
    pass("Vendor compliance center loads profile");
  } catch (e) {
    fail("Vendor compliance center loads profile", e);
  }

  try {
    if (await isPubliclyListed(restaurantId)) throw new Error("unapproved dispensary should not be listed");
    const detail = await getPublicDetail(restaurantId);
    if (!detail.error) throw new Error("unapproved dispensary detail should 404");
    pass("Unapproved dispensary hidden from public marketplace");
  } catch (e) {
    fail("Unapproved dispensary hidden from public marketplace", e);
  }

  try {
    adminToken = await getAdminToken();
    pass("Admin session for approval workflow");
  } catch (e) {
    fail("Admin session for approval workflow", e);
    await cleanup(vendorUserId);
    return summarize();
  }

  try {
    const result = await invokeApi(adminToken, `/admin/approvals/users/${vendorUserId}/action`, "POST", {
      action: "approve",
      notes: "dispensary-compliance-test",
    });
    if (result.approval_status !== "approved") throw new Error(`expected approved, got ${result.approval_status}`);

    const { data: profile } = await admin
      .from("merchant_compliance_profiles")
      .select("verification_status")
      .eq("merchant_id", restaurantId)
      .maybeSingle();
    if (profile?.verification_status !== "approved") {
      throw new Error(`profile status ${profile?.verification_status}`);
    }

    const { data: restaurant } = await admin
      .from("restaurants")
      .select("approved, active")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (!restaurant?.approved || !restaurant?.active) throw new Error("restaurant not active after approval");

    if (!(await isPubliclyListed(restaurantId))) throw new Error("approved dispensary should be listed");
    const detail = await getPublicDetail(restaurantId);
    if (detail.error) throw new Error("approved dispensary detail should load");
    if (detail.restaurant?.compliance_verification_status !== "approved") {
      throw new Error("detail missing approved compliance status");
    }
    pass("Admin approve syncs verification and publishes marketplace listing");
  } catch (e) {
    fail("Admin approve syncs verification and publishes marketplace listing", e);
  }

  try {
    await invokeApi(adminToken, `/admin/approvals/users/${vendorUserId}/action`, "POST", {
      action: "suspend",
      notes: "dispensary-compliance-test suspend",
    });
    const { data: profile } = await admin
      .from("merchant_compliance_profiles")
      .select("verification_status")
      .eq("merchant_id", restaurantId)
      .maybeSingle();
    if (profile?.verification_status !== "suspended") {
      throw new Error(`expected suspended, got ${profile?.verification_status}`);
    }
    if (await isPubliclyListed(restaurantId)) throw new Error("suspended dispensary should not be listed");
    pass("Admin suspend removes dispensary from public marketplace");
  } catch (e) {
    fail("Admin suspend removes dispensary from public marketplace", e);
  }

  try {
    await invokeApi(adminToken, `/admin/approvals/users/${vendorUserId}/action`, "POST", {
      action: "reject",
      notes: "dispensary-compliance-test reject",
    });
    const { data: profile } = await admin
      .from("merchant_compliance_profiles")
      .select("verification_status")
      .eq("merchant_id", restaurantId)
      .maybeSingle();
    if (profile?.verification_status !== "rejected") {
      throw new Error(`expected rejected, got ${profile?.verification_status}`);
    }
    pass("Admin reject updates compliance verification status");
  } catch (e) {
    fail("Admin reject updates compliance verification status", e);
  }

  try {
    await cleanup(vendorUserId);
    createdUserIds.length = 0;
    pass("Test data cleanup");
  } catch (e) {
    fail("Test data cleanup", e);
  }

  summarize();
}

function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  for (const userId of createdUserIds) {
    await cleanup(userId).catch(() => {});
  }
  process.exit(1);
});
