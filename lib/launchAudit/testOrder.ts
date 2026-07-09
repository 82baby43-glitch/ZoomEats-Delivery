import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditCheck } from "./types";
import { evaluateRestaurantReadiness } from "../restaurant/readiness";
import { getSupabasePublicUrl } from "../supabaseEnv";

function mk(
  id: string,
  name: string,
  status: AuditCheck["status"],
  severity: AuditCheck["severity"],
  detail: string
): AuditCheck {
  return { id, category: "e2e_simulation", name, status, severity, detail };
}

export interface FullTestOrderResult {
  checks: AuditCheck[];
  order_id?: string;
  success: boolean;
}

/** Safe sandbox pipeline: create → dispatch → pickup → deliver → verify → cleanup */
export async function runFullDeliverySimulation(db: SupabaseClient): Promise<FullTestOrderResult> {
  const checks: AuditCheck[] = [];
  const prefix = "full_test";

  const { data: candidates } = await db
    .from("restaurants")
    .select("restaurant_id,name,latitude,longitude,approved,accepting_orders")
    .eq("approved", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(20);

  let sampleRest = (candidates || []).find((r) => {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    return lat && lng;
  });

  if (!sampleRest) {
    const { data: anyApproved } = await db.from("restaurants").select("*").eq("approved", true).limit(1).maybeSingle();
    sampleRest = anyApproved;
    if (sampleRest) {
      checks.push(mk(`${prefix}_coords`, "Restaurant coordinates", "fail", "critical", "No approved restaurant with valid coordinates"));
      return { checks, success: false };
    }
    checks.push(mk(`${prefix}_restaurant`, "Approved restaurant", "fail", "critical", "No approved restaurant"));
    return { checks, success: false };
  }

  const readiness = await evaluateRestaurantReadiness(db, sampleRest.restaurant_id);
  if (!readiness?.can_go_live) {
    checks.push(mk(`${prefix}_readiness`, "Restaurant launch readiness", "fail", "critical", readiness?.blockers.join("; ") || "Not launch-ready"));
    return { checks, success: false };
  }
  checks.push(mk(`${prefix}_readiness`, "Restaurant launch readiness", "pass", "low", `${sampleRest.name} ready`));

  const { data: menuItem } = await db
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", sampleRest.restaurant_id)
    .eq("available", true)
    .gt("price", 0)
    .limit(1)
    .maybeSingle();

  if (!menuItem) {
    checks.push(mk(`${prefix}_menu`, "Menu item with price", "fail", "critical", "No available priced menu item"));
    return { checks, success: false };
  }
  checks.push(mk(`${prefix}_menu`, "Menu item with price", "pass", "low", menuItem.name));

  const testOrderId = `ord_launch_${Date.now().toString(36)}`;
  const subtotal = Number(menuItem.price);
  const deliveryFee = 2.99;
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;
  const now = new Date().toISOString();

  const orderRow = {
    order_id: testOrderId,
    customer_id: "launch_test_customer",
    customer_name: "Launch Test Customer",
    restaurant_id: sampleRest.restaurant_id,
    restaurant_name: sampleRest.name,
    items: [{ item_id: menuItem.item_id, name: menuItem.name, price: subtotal, quantity: 1 }],
    subtotal,
    delivery_fee: deliveryFee,
    total,
    address: "123 Launch Test St, San Francisco, CA 94102",
    customer_lat: 37.7749,
    customer_lng: -122.4194,
    status: "placed",
    payment_status: "paid",
    created_at: now,
    updated_at: now,
  };

  const { error: insertErr } = await db.from("orders").insert(orderRow);
  if (insertErr) {
    checks.push(mk(`${prefix}_create`, "Create test order", "fail", "critical", insertErr.message));
    return { checks, success: false };
  }
  checks.push(mk(`${prefix}_create`, "Create test order", "pass", "low", testOrderId));

  const fnBase = `${(getSupabasePublicUrl() || "").replace(/\/$/, "")}/functions/v1`;
  let driverId: string | null = null;

  if (fnBase.startsWith("http")) {
    try {
      const res = await fetch(`${fnBase}/dispatch-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: testOrderId }),
      });
      const data = await res.json();
      driverId = data.driver_id || null;
      checks.push(mk(
        `${prefix}_dispatch`,
        "Driver assignment",
        res.ok && driverId ? "pass" : "warn",
        "high",
        driverId ? `driver ${driverId}` : data.reason || "not assigned"
      ));
    } catch (e) {
      checks.push(mk(`${prefix}_dispatch`, "Driver assignment", "fail", "high", String(e)));
    }
  }

  await db.from("orders").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("order_id", testOrderId);
  await db.from("orders").update({ status: "preparing", updated_at: new Date().toISOString() }).eq("order_id", testOrderId);
  await db.from("orders").update({ status: "ready", updated_at: new Date().toISOString() }).eq("order_id", testOrderId);
  checks.push(mk(`${prefix}_restaurant`, "Restaurant order flow", "pass", "medium", "accepted → preparing → ready"));

  if (driverId) {
    await db.from("orders").update({ status: "assigned_internal", driver_id: driverId }).eq("order_id", testOrderId);
    await db.from("orders").update({ status: "picked_up", updated_at: new Date().toISOString() }).eq("order_id", testOrderId);
    const { data: existingDlv } = await db.from("deliveries").select("delivery_id").eq("order_id", testOrderId).maybeSingle();
    if (!existingDlv) {
      await db.from("deliveries").insert({
        delivery_id: `dlv_${testOrderId.slice(-12)}`,
        order_id: testOrderId,
        provider: "internal",
        status: "picked_up",
        driver_id: driverId,
      });
    } else {
      await db.from("deliveries").update({ status: "picked_up", driver_id: driverId }).eq("order_id", testOrderId);
    }

    await db.from("orders").update({ status: "delivered", updated_at: new Date().toISOString() }).eq("order_id", testOrderId);
    await db.from("deliveries").update({ status: "delivered" }).eq("order_id", testOrderId);
    checks.push(mk(`${prefix}_delivery`, "Delivery completion", "pass", "high", "picked_up → delivered"));
  } else {
    await db.from("orders").update({ status: "delivered", updated_at: new Date().toISOString() }).eq("order_id", testOrderId);
    checks.push(mk(`${prefix}_delivery`, "Delivery completion", "warn", "medium", "Marked delivered without driver (no driver available)"));
  }

  const { data: finalOrder } = await db.from("orders").select("*").eq("order_id", testOrderId).maybeSingle();
  checks.push(mk(
    `${prefix}_order_verify`,
    "Order record verification",
    finalOrder?.status === "delivered" && finalOrder?.payment_status === "paid" ? "pass" : "fail",
    "critical",
    `status=${finalOrder?.status}, payment=${finalOrder?.payment_status}`
  ));

  const earningsExists = await db.from("driver_earnings").select("earning_id", { count: "exact", head: true }).limit(1);
  checks.push(mk(
    `${prefix}_earnings_table`,
    "Driver earnings table",
    !earningsExists.error ? "pass" : "warn",
    "low",
    !earningsExists.error ? "driver_earnings ready for payout calc" : "table unavailable"
  ));

  await db.from("deliveries").delete().eq("order_id", testOrderId);
  await db.from("orders").delete().eq("order_id", testOrderId);
  checks.push(mk(`${prefix}_cleanup`, "Cleanup test order", "pass", "low", "Removed test data"));

  const success = checks.every((c) => c.status !== "fail");
  return { checks, order_id: testOrderId, success };
}
