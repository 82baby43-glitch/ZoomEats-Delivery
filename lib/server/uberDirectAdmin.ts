import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelUberDelivery,
  createUberDeliveryQuote,
  getUberDelivery,
  verifyUberDirectConnection,
} from "../dispatch/uberDirect";
import { getUberDirectConfig } from "./uberDirectEnv";

type AdminCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
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

type DeliveryRow = {
  delivery_id: string;
  order_id: string;
  tracking_id?: string | null;
  uber_delivery_id?: string | null;
  status?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string;
};

function resolveUberDeliveryId(row?: DeliveryRow | null, override?: string): string | null {
  if (override) return override;
  if (!row) return null;
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const raw = meta.raw && typeof meta.raw === "object" ? (meta.raw as { id?: string }) : null;
  return row.uber_delivery_id || row.tracking_id || raw?.id || null;
}

async function findQuoteTestRestaurant(db: SupabaseClient) {
  const { data: restaurants } = await db
    .from("restaurants")
    .select("name,address,latitude,longitude")
    .eq("approved", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(20);

  return (restaurants || []).find((r) => r.address?.trim()) || restaurants?.[0] || null;
}

function quoteDropoffForRestaurant(rest: { latitude?: number | null; longitude?: number | null; address?: string | null }) {
  const lat = Number(rest.latitude);
  const lng = Number(rest.longitude);
  if (lat > 38.8 && lat < 39.1 && lng > -92.5 && lng < -92.2) {
    return {
      address: "1200 E Broadway, Columbia, MO 65201",
      lat: 38.9519,
      lng: -92.326,
    };
  }
  return {
    address: rest.address || "Unknown address",
    lat,
    lng,
  };
}

async function runUberDirectLiveTest(
  db: SupabaseClient,
  action: string,
  deliveryId?: string
): Promise<Record<string, unknown>> {
  const cfg = getUberDirectConfig();
  if (!cfg?.enabled) return { ok: false, error: "not_configured" };

  if (action === "quote") {
    const rest = await findQuoteTestRestaurant(db);
    if (!rest?.latitude || !rest?.longitude) {
      return { ok: false, error: "no_restaurant_for_quote" };
    }

    const pickupAddress = rest.address?.includes(",")
      ? rest.address
      : `${rest.address}, Columbia, MO 65201`;
    const dropoff = quoteDropoffForRestaurant(rest);
    const quote = await createUberDeliveryQuote(cfg, {
      restaurantAddress: pickupAddress,
      customerAddress: dropoff.address,
      pickupLat: rest.latitude,
      pickupLng: rest.longitude,
      customerLat: dropoff.lat,
      customerLng: dropoff.lng,
    });

    return {
      ok: true,
      action: "quote",
      restaurant: rest.name,
      pickup: pickupAddress,
      dropoff: dropoff.address,
      quote_id: quote.id,
      fee_cents: quote.fee,
      fee_usd: quote.fee != null ? (quote.fee / 100).toFixed(2) : null,
    };
  }

  if (action === "inspect") {
    const { data: rows } = await db
      .from("deliveries")
      .select("delivery_id,order_id,tracking_id,uber_delivery_id,status,meta,created_at")
      .eq("provider", "uber")
      .order("created_at", { ascending: false })
      .limit(5);

    const uberId = resolveUberDeliveryId(rows?.[0] as DeliveryRow | undefined, deliveryId);
    if (!uberId) {
      return { ok: true, action: "inspect", db_deliveries: rows || [], uber: null };
    }

    const live = await getUberDelivery(cfg, uberId);
    return {
      ok: true,
      action: "inspect",
      delivery_id: uberId,
      db_deliveries: rows || [],
      uber: {
        id: live.id,
        status: live.status,
        complete: live.complete,
        live_mode: live.live_mode,
        pickup_eta: live.pickup_eta,
        dropoff_eta: live.dropoff_eta,
        tracking_url: live.tracking_url,
        external_id: live.external_id,
      },
    };
  }

  if (action === "cancel") {
    let targetId = deliveryId || null;
    let orderId: string | null = null;

    if (deliveryId) {
      const { data: row } = await db
        .from("deliveries")
        .select("order_id,tracking_id,uber_delivery_id,meta")
        .or(`tracking_id.eq.${deliveryId},uber_delivery_id.eq.${deliveryId},delivery_id.eq.${deliveryId}`)
        .maybeSingle();
      targetId = resolveUberDeliveryId(row as DeliveryRow | null, deliveryId);
      orderId = row?.order_id || null;
    } else {
      const { data: row } = await db
        .from("deliveries")
        .select("order_id,tracking_id,uber_delivery_id,meta")
        .eq("provider", "uber")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetId = resolveUberDeliveryId(row as DeliveryRow | null);
      orderId = row?.order_id || null;
    }

    if (!targetId) return { ok: false, error: "no_delivery_id" };

    const canceled = await cancelUberDelivery(cfg, targetId);

    await db
      .from("deliveries")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .or(`tracking_id.eq.${targetId},uber_delivery_id.eq.${targetId}`);

    if (orderId || canceled.external_id) {
      await db
        .from("orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("order_id", String(orderId || canceled.external_id));
    }

    return {
      ok: true,
      action: "cancel",
      delivery_id: targetId,
      uber_status: canceled.status,
      complete: canceled.complete,
    };
  }

  return { ok: false, error: "unknown_action", action };
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

  if (path === "/admin/uber-direct/live-test" && method === "POST") {
    const action = String(ctx.body?.action || "quote");
    const deliveryId = typeof ctx.body?.delivery_id === "string" ? ctx.body.delivery_id : undefined;
    try {
      return await runUberDirectLiveTest(db, action, deliveryId);
    } catch (e) {
      return { ok: false, action, error: String(e) };
    }
  }

  return null;
}
