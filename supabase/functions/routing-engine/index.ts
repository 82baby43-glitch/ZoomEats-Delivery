// Routing engine — continuous optimization loop + GPS ingestion (intelligence layer)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  initializeRouteForOrder,
  processGpsAndMaybeReroute,
  runContinuousOptimizationLoop,
  tryInsertOrderIntoRoute,
} from "../_shared/routing/uber-routing-ai.ts";
import { createRoutingDbAdapter } from "../_shared/routing/db-adapter.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);
  const adapter = createRoutingDbAdapter(db);
  const runtime = { supabaseUrl, serviceKey };

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "loop";

    if (req.method === "POST" && action === "gps") {
      const body = await req.json();
      const state = await processGpsAndMaybeReroute(adapter, body, runtime);
      return Response.json({ ok: true, state }, { headers: cors });
    }

    if (req.method === "POST" && action === "init") {
      const { driver_id, order_id, lat, lng } = await req.json();
      const order = await adapter.getOrderCoords?.(order_id);
      if (!order) return Response.json({ error: "order_not_found" }, { status: 404, headers: cors });
      const state = await initializeRouteForOrder(
        adapter,
        driver_id,
        order,
        { lat: lat ?? 0, lng: lng ?? 0 },
        runtime
      );
      return Response.json({ ok: true, state }, { headers: cors });
    }

    if (req.method === "POST" && action === "insert") {
      const { driver_id, order_id } = await req.json();
      const order = await adapter.getOrderCoords?.(order_id);
      if (!order) return Response.json({ error: "order_not_found" }, { status: 404, headers: cors });
      const result = await tryInsertOrderIntoRoute(adapter, driver_id, order, runtime);
      return Response.json({ ok: true, ...result }, { headers: cors });
    }

    if (req.method === "POST" && action === "loop") {
      const { data: drivers } = await db
        .from("driver_route_states")
        .select("driver_id")
        .gte("updated_at", new Date(Date.now() - 3600_000).toISOString());
      const ids = (drivers ?? []).map((d: { driver_id: string }) => d.driver_id);
      await runContinuousOptimizationLoop(adapter, ids, runtime);
      return Response.json({ ok: true, drivers: ids.length }, { headers: cors });
    }

    return Response.json({ error: "unknown_action" }, { status: 400, headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: cors });
  }
});
