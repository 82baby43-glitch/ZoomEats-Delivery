#!/usr/bin/env node
/**
 * Verify live payment pipeline: confirm test PI → wait for webhook → assert order state.
 */
import { createClient } from "@supabase/supabase-js";

const key = process.env.Stripe_Api_Token || process.env.STRIPE_SECRET_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const orderId = process.argv[2];
const sessionId = process.argv[3];
const userId = process.argv[4];

if (!key || !url || !service || !orderId) {
  console.error("Usage: node scripts/verify-live-payment.mjs <order_id> [session_id] [user_id]");
  process.exit(1);
}

const db = createClient(url, service, { auth: { persistSession: false } });

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

console.log(`\n1. Creating test payment for order ${orderId}...`);

const { data: orderBefore } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
if (!orderBefore) {
  console.error("Order not found");
  process.exit(1);
}
console.log(`   Before: payment_status=${orderBefore.payment_status}, status=${orderBefore.status}, order_status=${orderBefore.order_status ?? "null"}`);

const pmRes = await fetch("https://api.stripe.com/v1/payment_methods", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ type: "card", "card[token]": "tok_visa" }),
});
const pm = await pmRes.json();
if (!pmRes.ok) {
  console.error("payment_method:", pm.error?.message);
  process.exit(1);
}

const piBody = new URLSearchParams({
  amount: String(Math.round(Number(orderBefore.total) * 100)),
  currency: "usd",
  confirm: "true",
  payment_method: pm.id,
  "automatic_payment_methods[enabled]": "true",
  "automatic_payment_methods[allow_redirects]": "never",
  "metadata[order_id]": orderId,
  "metadata[user_id]": userId || orderBefore.customer_id || "",
});
if (sessionId) piBody.set("metadata[session_id]", sessionId);

const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: piBody,
});
const pi = await piRes.json();
if (!piRes.ok) {
  console.error("payment_intent:", pi.error?.message);
  process.exit(1);
}
console.log(`✅ PaymentIntent ${pi.id} status=${pi.status}`);

console.log("\n2. Waiting for webhook to process (up to 30s)...");
let orderAfter = null;
for (let i = 0; i < 15; i++) {
  await sleep(2000);
  const { data } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (data?.payment_status === "paid") {
    orderAfter = data;
    break;
  }
  process.stdout.write(".");
}

console.log("");
if (!orderAfter) {
  const { data } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  orderAfter = data;
}

console.log(`   After: payment_status=${orderAfter?.payment_status}, status=${orderAfter?.status}, order_status=${orderAfter?.order_status ?? "null"}`);

const { data: logs } = await db
  .from("payment_logs")
  .select("stripe_event_id,event_type,status,processed_at")
  .eq("order_id", orderId)
  .order("processed_at", { ascending: false })
  .limit(3);

console.log("\n3. payment_logs for order:");
for (const row of logs || []) {
  console.log(`   ${row.stripe_event_id} ${row.event_type} ${row.status}`);
}

if (sessionId && anon) {
  console.log(`\n4. Checkout status poll for ${sessionId}...`);
  const statusRes = await fetch(`${url}/functions/v1/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
    body: JSON.stringify({ path: `/checkout/status/${sessionId}`, method: "GET" }),
  });
  const status = await statusRes.json();
  console.log(`   status=${status.status}, payment_status=${status.payment_status}, order_id=${status.order_id}`);
}

const pass =
  orderAfter?.payment_status === "paid" &&
  ["confirmed", "placed", "assigned_internal"].includes(orderAfter?.status ?? "") &&
  orderAfter?.order_status === "confirmed";

console.log(`\n${pass ? "✅ LIVE TEST PASSED" : "❌ LIVE TEST FAILED"}`);
process.exit(pass ? 0 : 1);
