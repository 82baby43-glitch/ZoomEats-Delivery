#!/usr/bin/env node
/**
 * Link a Stripe Connect account to a restaurant's onboarding record.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \\
 *     node scripts/link-stripe-connect.mjs acct_xxx --restaurant-id rest_abc
 *
 *   node scripts/link-stripe-connect.mjs acct_xxx --all-approved
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadDotEnvLocal();

const accountId = process.argv[2];
const restaurantIdArg = process.argv.find((_, i) => process.argv[i - 1] === "--restaurant-id");
const allApproved = process.argv.includes("--all-approved");
const incomplete = process.argv.includes("--incomplete");

if (!accountId?.startsWith("acct_")) {
  console.error("Usage: node scripts/link-stripe-connect.mjs acct_xxx --restaurant-id <id>");
  console.error("   or: node scripts/link-stripe-connect.mjs acct_xxx --all-approved");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function linkRestaurant(restaurantId, ownerId, name) {
  const userId = ownerId || `admin_link_${restaurantId}`;
  const complete = !incomplete;
  const { error } = await db.from("restaurant_onboarding").upsert({
    user_id: userId,
    restaurant_id: restaurantId,
    stripe_connect_id: accountId,
    stripe_connect_complete: complete,
    status: complete ? "complete" : "incomplete",
    updated_at: new Date().toISOString(),
    completed_at: complete ? new Date().toISOString() : null,
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  console.log(`Linked ${accountId} → ${name || restaurantId} (${restaurantId})`);
}

if (allApproved) {
  const { data: rows, error } = await db.from("restaurants").select("restaurant_id,owner_id,name").eq("approved", true).order("name");
  if (error || !rows?.length) {
    console.error(error?.message || "No approved restaurants found");
    process.exit(1);
  }
  for (const r of rows) {
    await linkRestaurant(r.restaurant_id, r.owner_id, r.name);
  }
} else if (restaurantIdArg) {
  const { data: rest, error } = await db.from("restaurants").select("restaurant_id,owner_id,name").eq("restaurant_id", restaurantIdArg).maybeSingle();
  if (error || !rest) {
    console.error(error?.message || `Restaurant not found: ${restaurantIdArg}`);
    process.exit(1);
  }
  await linkRestaurant(rest.restaurant_id, rest.owner_id, rest.name);
} else {
  console.error("Provide --restaurant-id <id> or --all-approved");
  process.exit(1);
}

console.log("Done.");
