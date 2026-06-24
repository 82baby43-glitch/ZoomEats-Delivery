// Supabase Edge Function: dispatch-order
// Triggered by Postgres pg_net.http_post on `orders` INSERT.
// Proxies the order_id to the FastAPI backend's /api/dispatch/trigger endpoint.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const FASTAPI_BASE_URL = Deno.env.get("FASTAPI_BASE_URL") ?? "";
const DISPATCH_TRIGGER_TOKEN = Deno.env.get("DISPATCH_TRIGGER_TOKEN") ?? "";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!FASTAPI_BASE_URL || !DISPATCH_TRIGGER_TOKEN) {
    console.error("Missing FASTAPI_BASE_URL or DISPATCH_TRIGGER_TOKEN secret");
    return new Response(JSON.stringify({ error: "misconfigured" }), { status: 500 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  // The trigger sends { record: <NEW row>, old_record: ..., type: 'INSERT'|'UPDATE' }
  const orderId = payload?.record?.order_id ?? payload?.order_id;
  if (!orderId) {
    return new Response(JSON.stringify({ error: "missing_order_id", payload }), { status: 400 });
  }

  try {
    const r = await fetch(`${FASTAPI_BASE_URL}/api/dispatch/trigger/${orderId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dispatch-Token": DISPATCH_TRIGGER_TOKEN,
      },
      body: JSON.stringify({ source: "supabase_trigger" }),
    });
    const text = await r.text();
    return new Response(text, { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("dispatch proxy error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 502 });
  }
});
