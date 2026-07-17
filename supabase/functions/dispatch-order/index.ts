// Supabase Edge Function: dispatch-order
// Triggered by Postgres on paid orders. Defers to driver offers; Uber Direct fallback runs in offer-order.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRoutingDbAdapter } from "../_shared/routing/db-adapter.ts";
import { tryInsertOrderIntoRoute } from "../_shared/routing/uber-routing-ai.ts";

type OrderRow = {
  order_id: string;
  payment_status?: string;
  driver_id?: string | null;
  delivery_type?: string | null;
  status?: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);
  const routingDb = createRoutingDbAdapter(db);
  const runtime = { supabaseUrl, serviceKey };

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

  return new Response(
    JSON.stringify({
      ok: true,
      order_id: orderId,
      driver_id: null,
      reason: "deferred_to_driver_offers",
      message: "Driver offers begin when restaurant accepts the order; Uber Direct fallback runs if no drivers are available",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
