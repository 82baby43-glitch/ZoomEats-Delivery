import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyUberDirectConnection } from "../dispatch/uberDirect";
import { getUberDirectConfig } from "./uberDirectEnv";

type AdminCtx = {
  path: string;
  method: string;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function maskId(value: string): string {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function isActiveDelivery(status?: string | null, orderStatus?: string | null): boolean {
  const s = (status || "").toLowerCase();
  const o = (orderStatus || "").toLowerCase();
  if (["delivered", "completed", "cancelled", "canceled", "failed"].includes(s)) return false;
  if (o === "delivered") return false;
  return true;
}

async function buildUberDirectOverview(db: SupabaseClient) {
  const cfg = getUberDirectConfig();
  const auth = cfg ? await verifyUberDirectConnection() : { ok: false, error: "not_configured" };

  const { data: deliveries } = await db
    .from("deliveries")
    .select("*")
    .eq("provider", "uber")
    .order("created_at", { ascending: false })
    .limit(50);

  const orderIds = [...new Set((deliveries || []).map((d) => d.order_id).filter(Boolean))];
  let ordersById: Record<string, Record<string, unknown>> = {};
  if (orderIds.length) {
    const { data: orders } = await db
      .from("orders")
      .select("order_id,customer_name,restaurant_name,total,status,delivery_type,address,created_at")
      .in("order_id", orderIds);
    ordersById = Object.fromEntries((orders || []).map((o) => [o.order_id, o]));
  }

  const { count: totalUberOrders } = await db
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("delivery_type", "uber");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const { count: todayUberOrders } = await db
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("delivery_type", "uber")
    .gte("created_at", today.toISOString());

  const rows = (deliveries || []).map((delivery) => {
    const order = ordersById[delivery.order_id] || null;
    const meta = (delivery.meta && typeof delivery.meta === "object" ? delivery.meta : {}) as Record<string, unknown>;
    return {
      delivery_id: delivery.delivery_id,
      order_id: delivery.order_id,
      uber_delivery_id: delivery.uber_delivery_id || delivery.tracking_id,
      status: delivery.status,
      order_status: order?.status || null,
      customer_name: order?.customer_name || null,
      restaurant_name: order?.restaurant_name || null,
      total: order?.total || null,
      tracking_url: typeof meta.tracking_url === "string" ? meta.tracking_url : null,
      eta: delivery.eta,
      created_at: delivery.created_at,
      active: isActiveDelivery(delivery.status, order?.status as string | undefined),
    };
  });

  const active = rows.filter((r) => r.active).length;
  const completed = rows.length - active;

  return {
    configured: Boolean(cfg),
    enabled: Boolean(cfg?.enabled),
    preferred: Boolean(cfg?.preferred),
    customer_id: cfg ? maskId(cfg.customerId) : null,
    client_id: cfg ? maskId(cfg.clientId) : null,
    auth,
    stats: {
      total_deliveries: deliveries?.length || 0,
      total_orders: totalUberOrders || 0,
      active,
      completed,
      today: todayUberOrders || 0,
    },
    deliveries: rows,
    links: {
      dashboard: "https://direct.uber.com",
      docs: "https://developer.uber.com/docs/deliveries",
    },
  };
}

export async function handleUberDirectAdminRequest(
  db: SupabaseClient,
  ctx: AdminCtx
): Promise<unknown | null> {
  const { path, method, requireRole } = ctx;
  if (!path.startsWith("/admin/uber-direct")) return null;

  requireRole("admin");

  if (path === "/admin/uber-direct" && method === "GET") {
    return buildUberDirectOverview(db);
  }

  if (path === "/admin/uber-direct/test" && method === "POST") {
    return verifyUberDirectConnection();
  }

  return null;
}
