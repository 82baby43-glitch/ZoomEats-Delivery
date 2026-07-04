// Supabase Edge Function: dispatch-order
// Triggered by Postgres on paid orders. Assigns nearest available driver.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);

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
    return new Response(JSON.stringify({ skipped: true, reason: "driver_assigned", driver_id: order.driver_id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: drivers } = await db
    .from("drivers")
    .select("*")
    .eq("availability", true)
    .order("workload", { ascending: true })
    .limit(1);

  const driver = drivers?.[0];
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

  return new Response(JSON.stringify({ ok: true, order_id: orderId, driver_id: driver.driver_id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
