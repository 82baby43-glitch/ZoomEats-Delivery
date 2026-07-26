import type { SupabaseClient } from "@supabase/supabase-js";
import { handleVendorOrderReady } from "../delivery/handler";
import { recordDeliveryEvent } from "../delivery/workflow";
import { buildRestaurantLogisticsView } from "../logistics/engine";
import { getWeeklyPayoutSummary } from "../restaurantCommission/engine";
import { syncRestaurantLaunchState } from "../restaurant/readiness";
import { isPaymentConfirmed } from "../orderState";

type HandlerCtx = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  params?: Record<string, string>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
  runtime?: { supabaseUrl?: string; serviceKey?: string };
};

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function vendorRestaurant(db: SupabaseClient, userId: string) {
  const { data: rest } = await db
    .from("restaurants")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!rest?.restaurant_id) throwErr("No restaurant found", 404);
  if (rest.is_test_account || rest.restaurant_type === "test") {
    throwErr("Test restaurants must use the admin simulator", 403);
  }
  return rest;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isOpenNow(restaurant: Record<string, unknown>): boolean {
  if (restaurant.accepting_orders === false || restaurant.active === false) return false;
  if (restaurant.temporary_closure) return false;
  const hours = restaurant.business_hours as Record<string, { open?: string; close?: string; closed?: boolean }> | null;
  if (!hours || !Object.keys(hours).length) return true;
  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const key = dayKeys[new Date().getDay()];
  const today = hours[key];
  if (!today || today.closed) return false;
  if (!today.open || !today.close) return true;
  const now = new Date();
  const [oh, om] = today.open.split(":").map(Number);
  const [ch, cm] = today.close.split(":").map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const curMin = now.getHours() * 60 + now.getMinutes();
  return curMin >= openMin && curMin < closeMin;
}

async function computeDashboardStats(db: SupabaseClient, restaurantId: string) {
  const todayStart = startOfDay();
  const { data: orders } = await db
    .from("orders")
    .select("order_id,status,total,payment_status,created_at,restaurant_ready_at,placed_at")
    .eq("restaurant_id", restaurantId)
    .eq("test_order", false)
    .gte("created_at", daysAgo(1));

  const allToday = (orders || []).filter((o) => o.created_at >= todayStart);
  const paid = allToday.filter((o) => isPaymentConfirmed(o));
  const waiting = paid.filter((o) => o.status === "placed").length;
  const preparing = paid.filter((o) => ["accepted", "preparing"].includes(String(o.status))).length;
  const ready = paid.filter((o) => o.status === "ready").length;
  const completedToday = paid.filter((o) => o.status === "delivered").length;
  const revenueToday = paid
    .filter((o) => o.status === "delivered")
    .reduce((s, o) => s + Number(o.total || 0), 0);

  return {
    orders_waiting: waiting,
    orders_preparing: preparing,
    ready_for_pickup: ready,
    completed_today: completedToday,
    revenue_today: Math.round(revenueToday * 100) / 100,
  };
}

async function computeAnalytics(db: SupabaseClient, restaurantId: string) {
  const { data: weekOrders } = await db
    .from("orders")
    .select("order_id,status,total,items,created_at,restaurant_ready_at,placed_at")
    .eq("restaurant_id", restaurantId)
    .eq("test_order", false)
    .gte("created_at", daysAgo(30));

  const orders = weekOrders || [];
  const todayStart = startOfDay();
  const weekStart = daysAgo(7);
  const monthStart = daysAgo(30);

  const sumRevenue = (list: typeof orders, statuses: string[]) =>
    list
      .filter((o) => statuses.includes(String(o.status)))
      .reduce((s, o) => s + Number(o.total || 0), 0);

  const completed = orders.filter((o) => o.status === "delivered");
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const prepTimes: number[] = [];
  for (const o of completed) {
    const start = o.placed_at || o.created_at;
    const end = o.restaurant_ready_at;
    if (start && end) {
      const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
      if (mins > 0 && mins < 180) prepTimes.push(mins);
    }
  }

  const itemCounts = new Map<string, number>();
  const hourCounts = new Array(24).fill(0);
  for (const o of orders) {
    const h = new Date(o.created_at).getHours();
    hourCounts[h] += 1;
    for (const it of (o.items as Array<{ name?: string; quantity?: number }>) || []) {
      const name = String(it.name || "Item");
      itemCounts.set(name, (itemCounts.get(name) || 0) + Number(it.quantity || 1));
    }
  }

  const bestSelling = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  return {
    sales_today: Math.round(sumRevenue(orders.filter((o) => o.created_at >= todayStart), ["delivered"]) * 100) / 100,
    sales_week: Math.round(sumRevenue(orders.filter((o) => o.created_at >= weekStart), ["delivered"]) * 100) / 100,
    sales_month: Math.round(sumRevenue(orders.filter((o) => o.created_at >= monthStart), ["delivered"]) * 100) / 100,
    completed_orders: completed.length,
    cancelled_orders: cancelled.length,
    avg_prep_time_min: prepTimes.length
      ? Math.round((prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) * 10) / 10
      : null,
    avg_ticket_size: completed.length
      ? Math.round((sumRevenue(completed, ["delivered"]) / completed.length) * 100) / 100
      : 0,
    best_selling_items: bestSelling,
    peak_ordering_hour: peakHour,
    orders_by_hour: hourCounts,
  };
}

const VENDOR_ORDER_STATUSES = new Set([
  "accepted",
  "preparing",
  "ready",
  "cancelled",
  "picked_up",
  "delivered",
]);

const RESTAURANT_PATCH_FIELDS = [
  "name",
  "description",
  "cuisine",
  "image_url",
  "cover_url",
  "address",
  "phone",
  "accepting_orders",
  "active",
  "delivery_enabled",
  "delivery_time_min",
  "delivery_radius_km",
  "minimum_order",
  "business_hours",
  "busy_mode",
  "holiday_schedule",
  "temporary_closure",
  "online_status",
] as const;

export async function handleVendorDashboardRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body, runtime } = ctx;

  if (path === "/vendor/dashboard" && method === "GET") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const rest = await vendorRestaurant(db, String(u.user_id));
    const [stats, logistics, payout] = await Promise.all([
      computeDashboardStats(db, String(rest.restaurant_id)),
      buildRestaurantLogisticsView(db, String(u.user_id)),
      getWeeklyPayoutSummary(db, String(rest.restaurant_id)).catch(() => null),
    ]);

    return {
      restaurant: rest,
      is_open: isOpenNow(rest),
      stats,
      pending_payout: payout?.net_payout_total ?? 0,
      active_deliveries: logistics?.active_orders?.length ?? 0,
      approach_alerts: logistics?.approach_alerts ?? [],
    };
  }

  if (path === "/vendor/analytics" && method === "GET") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const rest = await vendorRestaurant(db, String(u.user_id));
    return computeAnalytics(db, String(rest.restaurant_id));
  }

  if (path === "/vendor/restaurant/settings" && method === "PATCH") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const rest = await vendorRestaurant(db, String(u.user_id));
    const patch: Record<string, unknown> = {};
    for (const key of RESTAURANT_PATCH_FIELDS) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (!Object.keys(patch).length) throwErr("No fields to update");
    const { data } = await db
      .from("restaurants")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("restaurant_id", rest.restaurant_id)
      .select()
      .single();
    await syncRestaurantLaunchState(db, String(rest.restaurant_id));
    return data;
  }

  const menuPutMatch = path.match(/^\/vendor\/menu-items\/([^/]+)$/);
  if (menuPutMatch && method === "PUT") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const rest = await vendorRestaurant(db, String(u.user_id));
    const allowed = [
      "name",
      "description",
      "price",
      "image_url",
      "category",
      "available",
      "sold_out",
      "availability_schedule",
      "featured",
      "inventory_count",
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (!Object.keys(patch).length) throwErr("No fields to update");
    const { data, error } = await db
      .from("menu_items")
      .update(patch)
      .eq("item_id", menuPutMatch[1])
      .eq("restaurant_id", rest.restaurant_id)
      .select()
      .maybeSingle();
    if (error || !data) throwErr("Menu item not found", 404);
    await syncRestaurantLaunchState(db, String(rest.restaurant_id));
    return data;
  }

  const menuDupMatch = path.match(/^\/vendor\/menu-items\/([^/]+)\/duplicate$/);
  if (menuDupMatch && method === "POST") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const rest = await vendorRestaurant(db, String(u.user_id));
    const { data: source } = await db
      .from("menu_items")
      .select("*")
      .eq("item_id", menuDupMatch[1])
      .eq("restaurant_id", rest.restaurant_id)
      .maybeSingle();
    if (!source) throwErr("Menu item not found", 404);
    const { item_id: _removed, ...itemFields } = source;
    const row = {
      ...itemFields,
      item_id: uid("item"),
      name: `${source.name} (Copy)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data } = await db.from("menu_items").insert(row).select().single();
    await syncRestaurantLaunchState(db, String(rest.restaurant_id));
    return data;
  }

  const orderStatusMatch = path.match(/^\/vendor\/orders\/([^/]+)\/status$/);
  if (orderStatusMatch && method === "POST") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const newStatus = String(body.status || "");
    if (!VENDOR_ORDER_STATUSES.has(newStatus)) throwErr("Invalid status");
    const rest = await vendorRestaurant(db, String(u.user_id));
    const { data: existing } = await db
      .from("orders")
      .select("*")
      .eq("order_id", orderStatusMatch[1])
      .eq("restaurant_id", rest.restaurant_id)
      .eq("test_order", false)
      .maybeSingle();
    if (!existing) throwErr("Order not found", 404);

    const now = new Date().toISOString();

    if (newStatus === "cancelled") {
      await db
        .from("orders")
        .update({ status: "cancelled", updated_at: now })
        .eq("order_id", existing.order_id);
      await recordDeliveryEvent(db, String(existing.order_id), "order_cancelled", {
        actorRole: "vendor",
        message: "Order rejected by restaurant",
      });
      return { ok: true, status: "cancelled" };
    }

    if (newStatus === "ready") {
      await handleVendorOrderReady(db, existing, String(rest.restaurant_id), runtime);
      return { ok: true, status: "ready" };
    }

    if (newStatus === "picked_up") {
      await db
        .from("orders")
        .update({ status: "picked_up", picked_up_at: now, updated_at: now })
        .eq("order_id", existing.order_id);
      await recordDeliveryEvent(db, String(existing.order_id), "handed_to_driver", {
        actorRole: "vendor",
        message: "Order handed to driver",
      });
      return { ok: true, status: "picked_up" };
    }

    if (newStatus === "delivered") {
      const deliveryType = String(existing.delivery_type || "delivery");
      if (deliveryType !== "pickup" && !["picked_up", "out_for_delivery", "arrived_at_customer"].includes(String(existing.status))) {
        throwErr("Only pickup orders can be completed from the kitchen");
      }
      await db
        .from("orders")
        .update({ status: "delivered", delivered_at: now, updated_at: now })
        .eq("order_id", existing.order_id);
      await recordDeliveryEvent(db, String(existing.order_id), "order_delivered", {
        actorRole: "vendor",
        message: "Order completed",
      });
      return { ok: true, status: "delivered" };
    }

    await db
      .from("orders")
      .update({ status: newStatus, updated_at: now })
      .eq("order_id", existing.order_id);
    return { ok: true, status: newStatus };
  }

  if (path === "/vendor/messages/conversations" && method === "GET") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const rest = await vendorRestaurant(db, String(u.user_id));
    const { data } = await db
      .from("restaurant_conversations")
      .select("*")
      .eq("restaurant_id", rest.restaurant_id)
      .order("last_message_at", { ascending: false })
      .limit(50);
    return data || [];
  }

  if (path === "/vendor/messages/conversations" && method === "POST") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const rest = await vendorRestaurant(db, String(u.user_id));
    const conversationId = uid("conv");
    const row = {
      conversation_id: conversationId,
      restaurant_id: rest.restaurant_id,
      order_id: body.order_id ? String(body.order_id) : null,
      participant_type: String(body.participant_type || "customer"),
      participant_id: body.participant_id ? String(body.participant_id) : null,
      participant_name: body.participant_name ? String(body.participant_name) : "Customer",
    };
    const { data } = await db.from("restaurant_conversations").insert(row).select().single();
    return data;
  }

  const convMessagesMatch = path.match(/^\/vendor\/messages\/conversations\/([^/]+)$/);
  if (convMessagesMatch && method === "GET") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const rest = await vendorRestaurant(db, String(u.user_id));
    const { data: conv } = await db
      .from("restaurant_conversations")
      .select("conversation_id")
      .eq("conversation_id", convMessagesMatch[1])
      .eq("restaurant_id", rest.restaurant_id)
      .maybeSingle();
    if (!conv) throwErr("Conversation not found", 404);
    const { data } = await db
      .from("restaurant_messages")
      .select("*")
      .eq("conversation_id", convMessagesMatch[1])
      .order("created_at", { ascending: true });
    return data || [];
  }

  if (convMessagesMatch && method === "POST") {
    const u = ctx.requireRole("vendor", "restaurant_owner", "restaurant_staff");
    const rest = await vendorRestaurant(db, String(u.user_id));
    const text = String(body.body || "").trim();
    if (!text) throwErr("Message body required");
    const { data: conv } = await db
      .from("restaurant_conversations")
      .select("conversation_id")
      .eq("conversation_id", convMessagesMatch[1])
      .eq("restaurant_id", rest.restaurant_id)
      .maybeSingle();
    if (!conv) throwErr("Conversation not found", 404);
    const messageId = uid("msg");
    const now = new Date().toISOString();
    const { data } = await db
      .from("restaurant_messages")
      .insert({
        message_id: messageId,
        conversation_id: convMessagesMatch[1],
        restaurant_id: rest.restaurant_id,
        sender_role: "restaurant",
        sender_id: String(u.user_id),
        body: text,
        is_canned: body.is_canned === true,
        created_at: now,
      })
      .select()
      .single();
    await db
      .from("restaurant_conversations")
      .update({ last_message_at: now, updated_at: now })
      .eq("conversation_id", convMessagesMatch[1]);
    return data;
  }

  return null;
}
