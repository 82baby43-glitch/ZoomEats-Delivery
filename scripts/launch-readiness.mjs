#!/usr/bin/env node
/**
 * ZoomEats launch readiness — ordering, payments, dispatch, delivery smoke test.
 * Usage: node scripts/launch-readiness.mjs
 */
import { createClient } from "@supabase/supabase-js";

const PROD = "https://zoom-eats-delivery.vercel.app";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_KEY = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
const UBER_CLIENT_ID = process.env.UBER_DIRECT_CLIENT_ID;
const UBER_CLIENT_SECRET = process.env.UBER_DIRECT_CLIENT_SECRET;

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
}
function warn(name, detail = "") {
  results.push({ name, ok: null, detail });
  console.log(`⚠️  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchStatus(url, label) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (res.status === 200) pass(label, `HTTP ${res.status}`);
    else fail(label, `HTTP ${res.status}`);
    return res.status;
  } catch (e) {
    fail(label, String(e.message || e));
    return 0;
  }
}

async function main() {
  console.log("\n=== ZoomEats Launch Readiness Test ===\n");
  console.log(`Production: ${PROD}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // --- Frontend routes ---
  console.log("--- Frontend routes ---");
  await fetchStatus(`${PROD}/`, "Homepage");
  await fetchStatus(`${PROD}/admin`, "Admin dashboard");
  await fetchStatus(`${PROD}/admin/stripe`, "Admin Stripe");
  await fetchStatus(`${PROD}/admin/uber-direct`, "Admin Uber Direct");
  await fetchStatus(`${PROD}/login`, "Login page");
  await fetchStatus(`${PROD}/cart`, "Cart page");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    fail("Supabase credentials", "Missing SUPABASE_URL or SERVICE_ROLE_KEY");
    printSummary();
    process.exit(1);
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const fnBase = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1`;

  // --- API health ---
  console.log("\n--- API & edge functions ---");
  try {
    const r = await fetch(`${fnBase}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/", method: "GET" }),
    });
    const data = await r.json();
    if (r.ok && data.status === "ok") pass("API edge function", data.app || "ok");
    else fail("API edge function", JSON.stringify(data).slice(0, 120));
  } catch (e) {
    fail("API edge function", String(e));
  }

  // --- Marketplace data ---
  console.log("\n--- Marketplace data ---");
  const { data: restaurants, error: restErr } = await db
    .from("restaurants")
    .select("restaurant_id,name,approved,address,latitude,longitude,accepting_orders")
    .eq("approved", true)
    .limit(20);

  if (restErr) fail("Approved restaurants", restErr.message);
  else if (!restaurants?.length) fail("Approved restaurants", "0 approved — customers cannot order");
  else {
    pass("Approved restaurants", `${restaurants.length} found`);
    const withCoords = restaurants.filter((r) => r.latitude && r.longitude);
    const withAddress = restaurants.filter((r) => r.address?.trim());
    if (withCoords.length < restaurants.length)
      warn("Restaurant coordinates", `${restaurants.length - withCoords.length} missing lat/lng (dispatch may fail)`);
    else pass("Restaurant coordinates", "all have lat/lng");
    if (withAddress.length < restaurants.length)
      warn("Restaurant addresses", `${restaurants.length - withAddress.length} missing address`);
    else pass("Restaurant addresses", "all set");
  }

  const sampleRest = restaurants?.[0];
  let menuCount = 0;
  if (sampleRest) {
    const { data: menu } = await db
      .from("menu_items")
      .select("item_id")
      .eq("restaurant_id", sampleRest.restaurant_id)
      .eq("available", true);
    menuCount = menu?.length || 0;
    if (menuCount > 0) pass("Menu items", `${menuCount} available at ${sampleRest.name}`);
    else fail("Menu items", `no available items at ${sampleRest.name}`);
  }

  const { data: drivers } = await db.from("drivers").select("driver_id,availability,latitude,longitude").limit(20);
  const availDrivers = (drivers || []).filter((d) => d.availability);
  if (availDrivers.length > 0) pass("Internal drivers", `${availDrivers.length} available`);
  else warn("Internal drivers", "none available — dispatch will fall back to Uber Direct");

  // --- Payments ---
  console.log("\n--- Payments (Stripe) ---");
  if (!STRIPE_KEY) fail("Stripe API key", "not set in env");
  else {
    try {
      const r = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${STRIPE_KEY}` },
      });
      const data = await r.json();
      if (r.ok) pass("Stripe API", `${STRIPE_KEY.startsWith("sk_live") ? "live" : "test"} mode`);
      else fail("Stripe API", data?.error?.message || r.status);
    } catch (e) {
      fail("Stripe API", String(e));
    }
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (webhookSecret) pass("Stripe webhook secret", "configured");
  else warn("Stripe webhook secret", "not in env — webhooks may not verify");

  const { count: pendingPay } = await db
    .from("orders")
    .select("*", { count: "exact", head: true })
    .in("payment_status", ["pending", "initiated", "requires_payment"]);
  const { count: paidOrders } = await db
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("payment_status", "paid");
  pass("Order payment history", `${paidOrders || 0} paid, ${pendingPay || 0} pending`);

  // --- Uber Direct ---
  console.log("\n--- Delivery dispatch (Uber Direct) ---");
  if (UBER_CLIENT_ID && UBER_CLIENT_SECRET) {
    try {
      const body = new URLSearchParams({
        client_id: UBER_CLIENT_ID,
        client_secret: UBER_CLIENT_SECRET,
        grant_type: "client_credentials",
        scope: "eats.deliveries",
      });
      const r = await fetch("https://auth.uber.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await r.json();
      if (r.ok && data.access_token) pass("Uber Direct OAuth", "token OK");
      else fail("Uber Direct OAuth", data?.error || r.status);
    } catch (e) {
      fail("Uber Direct OAuth", String(e));
    }
  } else {
    warn("Uber Direct OAuth", "credentials not in env (may be Supabase-only)");
  }

  // --- Dispatch simulation ---
  console.log("\n--- Dispatch simulation ---");
  if (!sampleRest || menuCount === 0) {
    warn("Dispatch simulation", "skipped — no restaurant/menu");
  } else {
    const { data: menuItem } = await db
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", sampleRest.restaurant_id)
      .eq("available", true)
      .limit(1)
      .maybeSingle();

    const testOrderId = `ord_launch_${Date.now().toString(36)}`;
    const testAddress = "123 Main St, San Francisco, CA 94102";
    const orderRow = {
      order_id: testOrderId,
      customer_id: "launch_test_user",
      customer_name: "Launch Test",
      restaurant_id: sampleRest.restaurant_id,
      restaurant_name: sampleRest.name,
      items: [{ item_id: menuItem.item_id, name: menuItem.name, price: menuItem.price, quantity: 1 }],
      subtotal: menuItem.price,
      delivery_fee: 2.99,
      total: Math.round((menuItem.price + 2.99) * 100) / 100,
      address: testAddress,
      customer_lat: 37.7749,
      customer_lng: -122.4194,
      status: "placed",
      payment_status: "paid",
      order_status: "confirmed",
      created_at: new Date().toISOString(),
    };

    const { error: insertErr } = await db.from("orders").insert(orderRow);
    if (insertErr) {
      fail("Create test order", insertErr.message);
    } else {
      pass("Create test order", testOrderId);

      try {
        const dispatchRes = await fetch(`${fnBase}/dispatch-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: testOrderId }),
        });
        const dispatchData = await dispatchRes.json();
        if (dispatchRes.ok) {
          if (dispatchData.ok && (dispatchData.driver_id || dispatchData.uber_delivery_id || dispatchData.delivery_type === "uber")) {
            pass(
              "Dispatch-order",
              dispatchData.driver_id
                ? `internal driver ${dispatchData.driver_id}`
                : `uber ${dispatchData.uber_delivery_id || "assigned"}`
            );
          } else if (dispatchData.reason === "no_drivers" || dispatchData.reason === "no_drivers_uber_failed") {
            warn("Dispatch-order", dispatchData.reason + (dispatchData.detail ? `: ${String(dispatchData.detail).slice(0, 80)}` : ""));
          } else {
            pass("Dispatch-order", JSON.stringify(dispatchData).slice(0, 100));
          }
        } else {
          fail("Dispatch-order", JSON.stringify(dispatchData).slice(0, 120));
        }

        const { data: after } = await db.from("orders").select("status,delivery_type,driver_id").eq("order_id", testOrderId).maybeSingle();
        if (after?.delivery_type || after?.driver_id) {
          pass("Order after dispatch", `${after.delivery_type || "internal"} / ${after.status}`);
        } else {
          warn("Order after dispatch", `still unassigned — status ${after?.status}`);
        }

        const { data: delivery } = await db
          .from("deliveries")
          .select("provider,status,meta")
          .eq("order_id", testOrderId)
          .maybeSingle();
        if (delivery) pass("Delivery record", `${delivery.provider} / ${delivery.status}`);
        else warn("Delivery record", "not created");
      } catch (e) {
        fail("Dispatch-order", String(e));
      }

      // Cleanup test order
      await db.from("deliveries").delete().eq("order_id", testOrderId);
      await db.from("orders").delete().eq("order_id", testOrderId);
      pass("Cleanup test order", testOrderId);
    }
  }

  // --- Stuck orders ---
  console.log("\n--- Operational health ---");
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: stuck } = await db
    .from("orders")
    .select("order_id,status,payment_status")
    .eq("payment_status", "paid")
    .in("status", ["placed", "accepted", "preparing", "ready"])
    .lt("created_at", cutoff)
    .limit(10);
  if (stuck?.length) warn("Stuck paid orders", `${stuck.length} older than 30min without delivery`);
  else pass("Stuck paid orders", "none");

  const { data: unassignedPaid } = await db
    .from("orders")
    .select("order_id")
    .eq("payment_status", "paid")
    .is("driver_id", null)
    .neq("delivery_type", "uber")
    .in("status", ["placed", "accepted", "preparing", "ready"])
    .limit(5);
  if (unassignedPaid?.length) warn("Unassigned paid orders", `${unassignedPaid.length} without driver or uber`);
  else pass("Unassigned paid orders", "none in active pipeline");

  printSummary();
  process.exit(results.some((r) => r.ok === false) ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  const warnings = results.filter((r) => r.ok === null).length;
  console.log("\n=== Summary ===");
  console.log(`✅ ${passed} passed  ⚠️  ${warnings} warnings  ❌ ${failed} failed`);
  if (failed === 0 && warnings <= 3) {
    console.log("\n🚀 Launch readiness: GOOD — address warnings before high-volume launch.");
  } else if (failed === 0) {
    console.log("\n⚠️  Launch readiness: CAUTION — several warnings to resolve.");
  } else {
    console.log("\n🛑 Launch readiness: NOT READY — fix failures before launch.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
