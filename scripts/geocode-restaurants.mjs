#!/usr/bin/env node
/**
 * Backfill restaurant lat/lng via admin geocode API logic (service role).
 * Usage: node scripts/geocode-restaurants.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key);
const region = process.env.DEFAULT_GEOCODE_REGION || "Columbia, MO, USA";

async function nominatim(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": "ZoomEats/1.0 (geocode-restaurants)", Accept: "application/json" } }
  );
  const data = await res.json().catch(() => []);
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit?.lat || !hit?.lon) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), address: hit.display_name };
}

async function geocodeRest(name, address) {
  const queries = [
    address && !/,/.test(address) ? `${address}, ${region}` : null,
    address?.trim(),
    name ? `${name}, ${region}` : null,
  ].filter(Boolean);
  for (const q of queries) {
    const hit = await nominatim(q);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 350));
  }
  return null;
}

const { data: restaurants } = await db
  .from("restaurants")
  .select("restaurant_id,name,address,latitude,longitude")
  .eq("approved", true);

let geocoded = 0;
let failed = 0;
let skipped = 0;

for (const rest of restaurants || []) {
  if (rest.latitude != null && rest.longitude != null && rest.address?.trim()) {
    skipped++;
    continue;
  }
  const hit = await geocodeRest(rest.name, rest.address);
  if (!hit) {
    console.log(`❌ ${rest.name}`);
    failed++;
    continue;
  }
  await db.from("restaurants").update({
    latitude: hit.lat,
    longitude: hit.lng,
    address_validated: true,
    ...(rest.address?.length < 8 && hit.address ? { address: hit.address } : {}),
    updated_at: new Date().toISOString(),
  }).eq("restaurant_id", rest.restaurant_id);
  console.log(`✅ ${rest.name} → ${hit.lat}, ${hit.lng}`);
  geocoded++;
}

console.log(`\nDone: ${geocoded} geocoded, ${skipped} skipped, ${failed} failed`);
