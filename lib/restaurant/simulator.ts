import type { SupabaseClient } from "@supabase/supabase-js";
import { fulfillPaidOrder } from "../server/fulfillPaidOrder";
import { handleVendorOrderReady } from "../delivery/handler";
import { resolveSimulationCustomerId } from "../launchAudit/simulationCustomer";
import {
  isTestOrder,
  isTestRestaurant,
  TEST_CUSTOMER_USER_ID,
  TEST_RESTAURANT_ID,
  TEST_VENDOR_USER_ID,
} from "../orders/isTestOrder";
import { internalDispatchHeaders, resolveEdgeFunctionSecretFromEnv } from "../launchAudit/edgeInternal";
import { getSupabasePublicUrl } from "../supabaseEnv";

const DEFAULT_MENU = [
  { item_id: "item_test_burger", name: "Burger", description: "Test kitchen classic burger", price: 12.99, category: "Mains" },
  { item_id: "item_test_fries", name: "Fries", description: "Crispy test fries", price: 4.99, category: "Sides" },
  { item_id: "item_test_drink", name: "Drink", description: "Fountain drink", price: 2.49, category: "Drinks" },
] as const;

export type SimulatorStatus = {
  restaurant: Record<string, unknown> | null;
  menu_count: number;
  active_orders: number;
  completed_orders: number;
  customer_id: string;
};

async function ensureTestCustomer(db: SupabaseClient): Promise<string> {
  const { data: existing } = await db.from("users").select("user_id").eq("user_id", TEST_CUSTOMER_USER_ID).maybeSingle();
  if (existing?.user_id) return existing.user_id;

  const { error } = await db.from("users").upsert({
    user_id: TEST_CUSTOMER_USER_ID,
    email: "test-customer@zoomeats.internal",
    name: "ZoomEats Test Customer",
    role: "customer",
    active: true,
    approval_status: "approved",
    created_at: new Date().toISOString(),
  });
  if (!error) return TEST_CUSTOMER_USER_ID;
  return resolveSimulationCustomerId(db);
}

async function ensureTestVendor(db: SupabaseClient): Promise<string> {
  const { data: existing } = await db.from("users").select("user_id").eq("user_id", TEST_VENDOR_USER_ID).maybeSingle();
  if (existing?.user_id) return existing.user_id;

  const now = new Date().toISOString();
  const { error } = await db.from("users").upsert({
    user_id: TEST_VENDOR_USER_ID,
    email: "test-kitchen@zoomeats.internal",
    name: "ZoomEats Test Kitchen",
    role: "vendor",
    active: true,
    approval_status: "approved",
    agreement_complete: true,
    created_at: now,
  });
  if (error) throw new Error(error.message);
  return TEST_VENDOR_USER_ID;
}

export async function getSimulatorStatus(db: SupabaseClient): Promise<SimulatorStatus> {
  const customerId = await ensureTestCustomer(db);
  const { data: restaurant } = await db
    .from("restaurants")
    .select("*")
    .eq("restaurant_id", TEST_RESTAURANT_ID)
    .maybeSingle();

  const { count: menuCount } = await db
    .from("menu_items")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", TEST_RESTAURANT_ID);

  const { data: orders } = await db
    .from("orders")
    .select("order_id,status")
    .eq("restaurant_id", TEST_RESTAURANT_ID)
    .eq("test_order", true);

  const active = (orders || []).filter((o) => !["delivered", "cancelled", "failed", "refunded"].includes(String(o.status)));
  const completed = (orders || []).filter((o) => o.status === "delivered");

  return {
    restaurant: restaurant || null,
    menu_count: menuCount || 0,
    active_orders: active.length,
    completed_orders: completed.length,
    customer_id: customerId,
  };
}

export async function setupTestRestaurant(db: SupabaseClient) {
  const ownerId = await ensureTestVendor(db);
  const now = new Date().toISOString();

  const restaurantRow = {
    restaurant_id: TEST_RESTAURANT_ID,
    owner_id: ownerId,
    name: "ZoomEats Test Kitchen",
    description: "Admin sandbox kitchen for end-to-end order testing",
    cuisine: "American",
    address: "123 Test Location, San Francisco, CA 94102",
    phone: "(555) 010-TEST",
    approved: true,
    approval_status: "approved",
    agreement_complete: true,
    active: true,
    delivery_enabled: true,
    accepting_orders: true,
    launch_status: "ready",
    latitude: 37.7749,
    longitude: -122.4194,
    city: "San Francisco",
    state: "CA",
    zip_code: "94102",
    address_validated: true,
    restaurant_type: "test",
    is_test_account: true,
    merchant_category_slug: "restaurants",
    created_at: now,
    updated_at: now,
  };

  const { error: restErr } = await db.from("restaurants").upsert(restaurantRow);
  if (restErr) throw new Error(restErr.message);

  for (const item of DEFAULT_MENU) {
    const { error } = await db.from("menu_items").upsert({
      ...item,
      restaurant_id: TEST_RESTAURANT_ID,
      available: true,
      image_url: "",
    });
    if (error) throw new Error(error.message);
  }

  return getSimulatorStatus(db);
}

async function assertTestRestaurant(db: SupabaseClient) {
  const { data: restaurant } = await db
    .from("restaurants")
    .select("*")
    .eq("restaurant_id", TEST_RESTAURANT_ID)
    .maybeSingle();
  if (!restaurant || !isTestRestaurant(restaurant)) {
    throw new Error("Test restaurant not configured. Run setup first.");
  }
  return restaurant;
}

async function dispatchTestOrder(orderId: string) {
  const fnBase = `${(getSupabasePublicUrl() || "").replace(/\/$/, "")}/functions/v1`;
  if (!fnBase.startsWith("http")) return null;
  const res = await fetch(`${fnBase}/dispatch-order`, {
    method: "POST",
    headers: internalDispatchHeaders(resolveEdgeFunctionSecretFromEnv()),
    body: JSON.stringify({ order_id: orderId }),
  });
  return res.json().catch(() => ({}));
}

export async function createTestOrder(db: SupabaseClient, options?: { item_id?: string; quantity?: number }) {
  const restaurant = await assertTestRestaurant(db);
  const customerId = await ensureTestCustomer(db);

  const { data: menuItem } = await db
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", TEST_RESTAURANT_ID)
    .eq("available", true)
    .eq(options?.item_id ? "item_id" : "name", options?.item_id || "Burger")
    .maybeSingle();

  if (!menuItem) throw new Error("Test menu not found. Run setup first.");

  const qty = Math.max(1, Math.min(Number(options?.quantity || 1), 5));
  const subtotal = Math.round(Number(menuItem.price) * qty * 100) / 100;
  const deliveryFee = 2.99;
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;
  const orderId = `ord_test_${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const orderRow = {
    order_id: orderId,
    customer_id: customerId,
    customer_name: "ZoomEats Test Customer",
    restaurant_id: TEST_RESTAURANT_ID,
    restaurant_name: restaurant.name,
    items: [{ item_id: menuItem.item_id, name: menuItem.name, price: menuItem.price, quantity: qty }],
    subtotal,
    delivery_fee: deliveryFee,
    total,
    address: "456 Test Customer Ave, San Francisco, CA 94103",
    customer_lat: 37.7849,
    customer_lng: -122.4094,
    status: "pending_payment",
    payment_status: "pending",
    order_status: "awaiting_payment",
    test_order: true,
    created_at: now,
    updated_at: now,
  };

  const { error: insertErr } = await db.from("orders").insert(orderRow);
  if (insertErr) throw new Error(insertErr.message);

  await fulfillPaidOrder(db, {
    orderId,
    sessionId: `cs_test_${orderId}`,
    amountPaid: total,
    currency: "usd",
  });

  const dispatch = await dispatchTestOrder(orderId);

  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  return { order, dispatch };
}

export async function listTestRestaurantOrders(db: SupabaseClient) {
  await assertTestRestaurant(db);
  const { data } = await db
    .from("orders")
    .select("*")
    .eq("restaurant_id", TEST_RESTAURANT_ID)
    .eq("test_order", true)
    .order("created_at", { ascending: false });
  return data || [];
}

const VENDOR_STATUSES = new Set(["accepted", "preparing", "ready"]);
const REJECT_STATUS = "cancelled";

export async function updateTestOrderStatus(
  db: SupabaseClient,
  orderId: string,
  status: string
) {
  await assertTestRestaurant(db);
  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("order_id", orderId)
    .eq("restaurant_id", TEST_RESTAURANT_ID)
    .eq("test_order", true)
    .maybeSingle();
  if (!order) throw new Error("Test order not found");

  if (status === REJECT_STATUS) {
    await db.from("orders").update({ status: REJECT_STATUS, updated_at: new Date().toISOString() }).eq("order_id", orderId);
    return { ok: true, status: REJECT_STATUS };
  }

  if (!VENDOR_STATUSES.has(status)) throw new Error("Invalid status");

  if (status === "ready") {
    await handleVendorOrderReady(db, order, TEST_RESTAURANT_ID, {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  } else {
    await db.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("order_id", orderId);
  }

  return { ok: true, status };
}

async function deleteTestOrderData(db: SupabaseClient, orderIds: string[]) {
  if (!orderIds.length) return;
  await db.from("driver_order_offers").delete().in("order_id", orderIds);
  await db.from("delivery_events").delete().in("order_id", orderIds);
  await db.from("deliveries").delete().in("order_id", orderIds);
  await db.from("driver_earnings").delete().in("order_id", orderIds);
  await db.from("restaurant_settlements").delete().in("order_id", orderIds);
  await db.from("platform_revenue").delete().in("order_id", orderIds);
  await db.from("orders").delete().in("order_id", orderIds);
}

export async function clearTestOrders(db: SupabaseClient) {
  const { data: orders } = await db
    .from("orders")
    .select("order_id")
    .eq("restaurant_id", TEST_RESTAURANT_ID)
    .eq("test_order", true);
  const orderIds = (orders || []).map((o) => o.order_id);
  await deleteTestOrderData(db, orderIds);
  return { cleared: orderIds.length };
}

export async function resetTestEnvironment(db: SupabaseClient) {
  await clearTestOrders(db);
  return setupTestRestaurant(db);
}

export function isSimulatorOrder(row: TestOrderLike | null | undefined): boolean {
  return isTestOrder(row);
}
