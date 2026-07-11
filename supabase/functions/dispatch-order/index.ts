// Supabase Edge Function: dispatch-order
// Triggered by Postgres on paid orders. Assigns internal driver or Uber Direct fallback.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRoutingDbAdapter } from "../_shared/routing/db-adapter.ts";
import {
  buildManifestFromOrderItems,
  dispatchOrderViaUberDirect,
  type DispatchOrderContext,
} from "../_shared/uberDirect.ts";
import { getUberDirectConfig } from "../_shared/uberDirectEnv.ts";

type OrderRow = {
  order_id: string;
  payment_status?: string;
  driver_id?: string | null;
  delivery_type?: string | null;
  status?: string;
  customer_name?: string;
  address?: string;
  customer_lat?: number | null;
  customer_lng?: number | null;
  restaurant_id?: string;
  restaurant_name?: string;
  items?: Array<{ name?: string; quantity?: number; price?: number }>;
  total?: number;
};

type RestaurantRow = {
  name?: string;
  address?: string;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

async function loadUberDispatchContext(
  db: ReturnType<typeof createClient>,
  order: OrderRow
): Promise<DispatchOrderContext | null> {
  if (!order.address?.trim()) return null;

  let restaurant: RestaurantRow | null = null;
  if (order.restaurant_id) {
    const { data } = await db
      .from("restaurants")
      .select("name,address,phone,latitude,longitude")
      .eq("restaurant_id", order.restaurant_id)
      .maybeSingle();
    restaurant = data;
  }

  const restaurantAddress = restaurant?.address || order.restaurant_name || "Restaurant";
  const { items, manifestTotalCents } = buildManifestFromOrderItems(order.items, Number(order.total) || 0);

  return {
    orderId: order.order_id,
    customerName: order.customer_name || "Customer",
    customerAddress: order.address,
    customerLat: order.customer_lat,
    customerLng: order.customer_lng,
    restaurantName: restaurant?.name || order.restaurant_name || "Restaurant",
    restaurantAddress,
    restaurantPhone: restaurant?.phone,
    pickupLat: restaurant?.latitude,
    pickupLng: restaurant?.longitude,
    items,
    manifestTotalCents,
  };
}

async function assignUberDirect(
  db: ReturnType<typeof createClient>,
  order: OrderRow
): Promise<Response> {
  const ctx = await loadUberDispatchContext(db, order);
  if (!ctx) {
    return new Response(JSON.stringify({ error: "uber_context_missing", order_id: order.order_id }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  const uberDelivery = await dispatchOrderViaUberDirect(ctx);
  const trackingId = uberDelivery.id || `uber_${order.order_id}`;
  const eta = uberDelivery.dropoff_eta || uberDelivery.pickup_eta || null;

  const { error: updateError } = await db
    .from("orders")
    .update({
      status: "assigned_uber",
      delivery_type: "uber",
      tracking_id: trackingId,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", order.order_id)
    .eq("payment_status", "paid")
    .is("driver_id", null);

  if (updateError) {
    console.error(JSON.stringify({ error: updateError.message, order_id: order.order_id }));
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.from("deliveries").insert({
    delivery_id: `dlv_${crypto.randomUUID().slice(0, 12)}`,
    order_id: order.order_id,
    provider: "uber",
    tracking_id: trackingId,
    uber_delivery_id: uberDelivery.id,
    status: uberDelivery.status || "assigned",
    eta,
    meta: {
      tracking_url: uberDelivery.tracking_url,
      quote_id: uberDelivery.quote_id,
      provider: "uber_direct",
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      order_id: order.order_id,
      delivery_type: "uber",
      uber_delivery_id: uberDelivery.id,
      tracking_url: uberDelivery.tracking_url,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);
  const routingDb = createRoutingDbAdapter(db);
  const runtime = { supabaseUrl, serviceKey };
  const uberCfg = getUberDirectConfig();

  let payload: { record?: { order_id?: string }; order_id?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const orderId = payload?.record?.order_id ?? payload?.order_id;
  if (!orderId) {
    return new Response(JSON.stringify({ error: "missing_order_id" }), { status: 400 });
  }

  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();

  if (!order || order.payment_status !== "paid") {
    return new Response(JSON.stringify({ skipped: true, reason: "not_paid" }), { status: 200 });
  }

  if (order.delivery_type === "uber" || order.status === "assigned_uber") {
    return new Response(JSON.stringify({ skipped: true, reason: "uber_already_assigned" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (order.driver_id) {
    const orderRef = await routingDb.getOrderCoords?.(orderId);
    if (orderRef) {
      try {
        const inserted = await tryInsertOrderIntoRoute(routingDb, order.driver_id, orderRef, runtime);
        if (inserted.inserted) {
          return new Response(
            JSON.stringify({
              ok: true,
              order_id: orderId,
              driver_id: order.driver_id,
              routing: "inserted_into_stack",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (e) {
        console.warn(JSON.stringify({ routing_insert_skipped: String(e), order_id: orderId }));
      }
    }
    return new Response(JSON.stringify({ skipped: true, reason: "driver_assigned", driver_id: order.driver_id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const orderRef = await routingDb.getOrderCoords?.(orderId);
  if (!orderRef) {
    return new Response(JSON.stringify({ error: "order_coords_missing" }), { status: 404 });
  }

  // Internal driver assignment deferred to offer-order when restaurant accepts.
  // Payment-time dispatch only handles Uber Direct fallback when preferred.
  if (uberCfg?.enabled && uberCfg.preferred) {
    try {
      return await assignUberDirect(db, order as OrderRow);
    } catch (e) {
      console.error(JSON.stringify({ uber_direct_failed: String(e), order_id: orderId }));
      return new Response(JSON.stringify({ error: "uber_direct_failed", detail: String(e) }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      order_id: orderId,
      driver_id: null,
      reason: "deferred_to_driver_offers",
      message: "Driver offers begin when restaurant accepts the order",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
