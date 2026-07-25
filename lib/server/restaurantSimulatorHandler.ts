import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearTestOrders,
  createTestOrder,
  getSimulatorStatus,
  listTestRestaurantOrders,
  resetTestEnvironment,
  setupTestRestaurant,
  updateTestOrderStatus,
} from "../restaurant/simulator";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

type AdminCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

export async function handleRestaurantSimulatorRequest(
  db: SupabaseClient,
  ctx: AdminCtx
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = ctx;

  if (!path.startsWith("/admin/restaurant-simulator")) return null;

  ctx.requireRole("admin");

  if (path === "/admin/restaurant-simulator" && method === "GET") {
    return getSimulatorStatus(db);
  }

  if (path === "/admin/restaurant-simulator/setup" && method === "POST") {
    return setupTestRestaurant(db);
  }

  if (path === "/admin/restaurant-simulator/create-order" && method === "POST") {
    return createTestOrder(db, {
      item_id: body.item_id as string | undefined,
      quantity: body.quantity ? Number(body.quantity) : undefined,
    });
  }

  if (path === "/admin/restaurant-simulator/orders" && method === "GET") {
    return listTestRestaurantOrders(db);
  }

  const statusMatch = path.match(/^\/admin\/restaurant-simulator\/orders\/([^/]+)\/status$/);
  if (statusMatch && method === "POST") {
    const status = String(body.status || "");
    if (!status) throwErr("status required");
    return updateTestOrderStatus(db, statusMatch[1], status);
  }

  if (path === "/admin/restaurant-simulator/clear-orders" && method === "POST") {
    return clearTestOrders(db);
  }

  if (path === "/admin/restaurant-simulator/reset" && method === "POST") {
    return resetTestEnvironment(db);
  }

  if (path === "/admin/restaurant-simulator/menu" && method === "GET") {
    const status = await getSimulatorStatus(db);
    if (!status.restaurant) return [];
    const { data } = await db
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", status.restaurant.restaurant_id)
      .order("name");
    return data || [];
  }

  if (path === "/admin/restaurant-simulator/dashboard" && method === "GET") {
    return {
      ...(await getSimulatorStatus(db)),
      orders: await listTestRestaurantOrders(db),
    };
  }

  throwErr("Restaurant simulator route not found", 404);
}
