// Supabase Edge Function: dispatch-order
// Triggered by Postgres on paid orders. Assigns driver via routing intelligence layer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRoutingDbAdapter } from "../_shared/routing/db-adapter.ts";
import { selectOptimalDriverForOrder } from "../_shared/routing/dispatch-routing.ts";
import {
  initializeRouteForOrder,
  tryInsertOrderIntoRoute,
} from "../_shared/routing/uber-routing-ai.ts";

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

  const proposal = await selectOptimalDriverForOrder(db, routingDb, orderRef);

  let driver = null;
  if (proposal) {
    const { data } = await db.from("drivers").select("*").eq("driver_id", proposal.driverId).maybeSingle();
    driver = data;
  }

  if (!driver) {
    const { data: drivers } = await db
      .from("drivers")
      .select("*")
      .eq("availability", true)
      .order("workload", { ascending: true })
      .limit(1);
    driver = drivers?.[0] ?? null;
  }

  if (!driver) {
    return new Response(JSON.stringify({ ok: true, order_id: orderId, driver_id: null, reason: "no_drivers" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const trackingId = `trk_${orderId}`;
  const { error: updateError } = await db
    .from("orders")
    .update({
      driver_id: driver.driver_id,
      status: "assigned_internal",
      delivery_type: "internal",
      tracking_id: trackingId,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("payment_status", "paid")
    .is("driver_id", null);

  if (updateError) {
    console.error(JSON.stringify({ error: updateError.message, order_id: orderId }));
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.from("drivers").update({ workload: (driver.workload || 0) + 1 }).eq("driver_id", driver.driver_id);

  await db.from("deliveries").insert({
    delivery_id: `dlv_${crypto.randomUUID().slice(0, 12)}`,
    order_id: orderId,
    provider: "internal",
    tracking_id: trackingId,
    status: "assigned",
    driver_id: driver.driver_id,
  });

  const routingMode = proposal?.mode ?? "init";
  try {
    if (routingMode === "insert") {
      await tryInsertOrderIntoRoute(routingDb, driver.driver_id, orderRef, runtime);
    } else {
      await initializeRouteForOrder(
        routingDb,
        driver.driver_id,
        orderRef,
        { lat: driver.latitude ?? 0, lng: driver.longitude ?? 0 },
        runtime
      );
    }
  } catch (e) {
    console.warn(JSON.stringify({ routing_hook_skipped: String(e), order_id: orderId, mode: routingMode }));
  }

  return new Response(
    JSON.stringify({
      ok: true,
      order_id: orderId,
      driver_id: driver.driver_id,
      routing: routingMode,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
