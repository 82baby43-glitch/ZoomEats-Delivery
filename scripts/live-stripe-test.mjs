#!/usr/bin/env node
/**
 * Live Stripe E2E test: create order → checkout session → return URL for payment.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ORIGIN = process.env.TEST_ORIGIN_URL || "https://zoom-eats-delivery.vercel.app";

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const email = `stripe-live-test+${Date.now()}@zoomeats.test`;
const password = `Test_${Date.now()}_Aa1!`;

const { data: userData, error: userErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Stripe Live Test" },
});
if (userErr) {
  console.error("createUser:", userErr.message);
  process.exit(1);
}

const userId = userData.user.id;
await admin.from("users").upsert({
  user_id: userId,
  email,
  name: "Stripe Live Test",
  role: "customer",
});

const { data: restaurants } = await admin.from("restaurants").select("restaurant_id,name").eq("approved", true).limit(1);
const restaurant = restaurants?.[0];
if (!restaurant) {
  console.error("No approved restaurant");
  process.exit(1);
}

const { data: menu } = await admin
  .from("menu_items")
  .select("item_id,name,price")
  .eq("restaurant_id", restaurant.restaurant_id)
  .eq("available", true)
  .limit(1);
const item = menu?.[0];
if (!item) {
  console.error("No menu item");
  process.exit(1);
}

const client = createClient(SUPABASE_URL, ANON_KEY);
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (linkErr || !link?.properties?.hashed_token) {
  console.error("generateLink:", linkErr?.message ?? "no token");
  process.exit(1);
}
const { data: signIn, error: signInErr } = await client.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: "email",
});
if (signInErr) {
  console.error("signIn:", signInErr.message);
  process.exit(1);
}
const token = signIn.session.access_token;

async function api(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, method, body }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) throw new Error(data?.error || res.statusText);
  return data;
}

const order = await api("/orders", "POST", {
  restaurant_id: restaurant.restaurant_id,
  address: "123 Test Lane, San Francisco, CA",
  items: [{ item_id: item.item_id, quantity: 1 }],
});

const checkout = await api("/checkout/session", "POST", {
  order_id: order.order_id,
  origin_url: ORIGIN,
});

console.log(JSON.stringify({
  email,
  password,
  user_id: userId,
  order_id: order.order_id,
  total: order.total,
  restaurant: restaurant.name,
  item: item.name,
  session_id: checkout.session_id,
  checkout_url: checkout.url,
  success_url: `${ORIGIN}/checkout/success?session_id=${checkout.session_id}`,
}, null, 2));
