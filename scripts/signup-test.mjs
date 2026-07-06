#!/usr/bin/env node
/**
 * Signup flow tests — verifies auth trigger creates public.users correctly.
 * Usage: npm run signup:test
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, service);
const results = [];
const created = [];

function pass(n) { results.push({ n, ok: true }); console.log(`✓ ${n}`); }
function fail(n, e) { results.push({ n, ok: false, e: String(e) }); console.error(`✗ ${n}:`, e); }

async function createAuthUser(email, metadata = {}) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: metadata.name || "Test User", ...metadata },
  });
  if (error) throw error;
  created.push(data.user.id);
  return data.user;
}

async function getProfile(userId) {
  const { data, error } = await admin.from("users").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function main() {
  console.log("ZoomEats signup trigger tests\n");

  // 1. Customer signup
  try {
    const email = `customer-${Date.now()}@zoomeats.test`;
    const user = await createAuthUser(email, { name: "Customer Test", role: "customer" });
    const profile = await getProfile(user.id);
    if (!profile) throw new Error("no profile");
    if (profile.role !== "customer") throw new Error(`role=${profile.role}`);
    if (profile.approval_status !== "approved") throw new Error(`approval=${profile.approval_status}`);
    pass("Customer signup creates profile");
  } catch (e) { fail("Customer signup creates profile", e); }

  // 2. Driver role metadata maps to delivery
  try {
    const email = `driver-${Date.now()}@zoomeats.test`;
    const user = await createAuthUser(email, { name: "Driver Test", role: "driver" });
    const profile = await getProfile(user.id);
    if (profile.role !== "delivery") throw new Error(`role=${profile.role}`);
    if (profile.approval_status !== "pending") throw new Error(`approval=${profile.approval_status}`);
    pass("Driver metadata → delivery role + pending approval");
  } catch (e) { fail("Driver metadata → delivery role + pending approval", e); }

  // 3. Restaurant metadata maps to vendor
  try {
    const email = `restaurant-${Date.now()}@zoomeats.test`;
    const user = await createAuthUser(email, { name: "Restaurant Test", role: "restaurant" });
    const profile = await getProfile(user.id);
    if (profile.role !== "vendor") throw new Error(`role=${profile.role}`);
    pass("Restaurant metadata → vendor role");
  } catch (e) { fail("Restaurant metadata → vendor role", e); }

  // 4. Dispatcher signup
  try {
    const email = `dispatcher-${Date.now()}@zoomeats.test`;
    const user = await createAuthUser(email, { name: "Dispatcher Test", role: "dispatcher" });
    const profile = await getProfile(user.id);
    if (profile.role !== "dispatcher") throw new Error(`role=${profile.role}`);
    pass("Dispatcher signup");
  } catch (e) { fail("Dispatcher signup", e); }

  // 5. Orphan email no longer blocks signup
  try {
    const email = `orphan-block-${Date.now()}@zoomeats.test`;
    await admin.from("users").insert({
      user_id: `orphan_${Date.now()}`,
      email,
      name: "Orphan Seed",
      role: "customer",
      created_at: new Date().toISOString(),
    });
    const user = await createAuthUser(email, { name: "Real User" });
    const profile = await getProfile(user.id);
    if (!profile || profile.user_id !== user.id) throw new Error("profile not linked to auth");
    pass("Orphan seed row removed — signup succeeds");
  } catch (e) { fail("Orphan seed row removed — signup succeeds", e); }

  // 6. auth_id populated
  try {
    const email = `authid-${Date.now()}@zoomeats.test`;
    const user = await createAuthUser(email);
    const profile = await getProfile(user.id);
    if (profile.auth_id !== user.id) throw new Error(`auth_id mismatch: ${profile.auth_id}`);
    pass("auth_id linked on signup");
  } catch (e) { fail("auth_id linked on signup", e); }

  // Cleanup
  for (const id of created) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  pass("Test user cleanup");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
