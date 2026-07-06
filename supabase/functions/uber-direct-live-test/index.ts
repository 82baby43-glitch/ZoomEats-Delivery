/**
 * One-shot live Uber Direct ops test (quote, inspect, cancel).
 * Invoke with service role: POST /functions/v1/uber-direct-live-test
 * Body: { "action": "quote" | "inspect" | "cancel", "delivery_id"?: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createUberDeliveryQuote } from "../_shared/uberDirect.ts";
import { getUberDirectConfig } from "../_shared/uberDirectEnv.ts";

const AUTH_URL = "https://auth.uber.com/oauth/v2/token";
const API_BASE = "https://api.uber.com/v1";

async function fetchAccessToken(cfg: NonNullable<ReturnType<typeof getUberDirectConfig>>): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
    scope: "eats.deliveries",
  });
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`auth_${res.status}:${data?.error || "failed"}`);
  return data.access_token as string;
}

async function uberGet<T>(cfg: NonNullable<ReturnType<typeof getUberDirectConfig>>, path: string): Promise<T> {
  const token = await fetchAccessToken(cfg);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.message === "string" ? data.message : JSON.stringify(data).slice(0, 300);
    throw new Error(`uber_${res.status}:${detail}`);
  }
  return data as T;
}

async function uberPost<T>(cfg: NonNullable<ReturnType<typeof getUberDirectConfig>>, path: string): Promise<T> {
  const token = await fetchAccessToken(cfg);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.message === "string" ? data.message : JSON.stringify(data).slice(0, 300);
    throw new Error(`uber_${res.status}:${detail}`);
  }
  return data as T;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const auth = req.headers.get("Authorization") || "";
  if (!auth.includes(serviceKey) || !serviceKey) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const cfg = getUberDirectConfig();
  if (!cfg) {
    return new Response(JSON.stringify({ error: "not_configured" }), { status: 503 });
  }

  let payload: { action?: string; delivery_id?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const action = payload.action || "inspect";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  try {
    if (action === "quote") {
      const { data: rest } = await db
        .from("restaurants")
        .select("name,address,latitude,longitude")
        .eq("name", "Hachi Roll Co.")
        .maybeSingle();

      const pickupAddress = rest?.address?.includes(",")
        ? rest.address
        : "225 S 9th St, Columbia, MO 65201";
      const dropoffAddress = "700 E Broadway, Columbia, MO 65201";

      const quote = await createUberDeliveryQuote(cfg, {
        restaurantAddress: pickupAddress,
        customerAddress: dropoffAddress,
        pickupLat: rest?.latitude ?? 38.94866,
        pickupLng: rest?.longitude ?? -92.3279,
        customerLat: 38.9515,
        customerLng: -92.3295,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          action: "quote",
          pickup: pickupAddress,
          dropoff: dropoffAddress,
          quote_id: quote.id,
          fee_cents: quote.fee,
          fee_usd: quote.fee != null ? (quote.fee / 100).toFixed(2) : null,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (action === "inspect") {
      const deliveryId = payload.delivery_id;
      const { data: rows } = await db
        .from("deliveries")
        .select("delivery_id,order_id,tracking_id,uber_delivery_id,status,meta,created_at")
        .eq("provider", "uber")
        .order("created_at", { ascending: false })
        .limit(5);

      const uberId =
        deliveryId ||
        rows?.[0]?.uber_delivery_id ||
        rows?.[0]?.tracking_id ||
        (rows?.[0]?.meta as { raw?: { id?: string } } | null)?.raw?.id;

      if (!uberId) {
        return new Response(JSON.stringify({ ok: true, action: "inspect", db_deliveries: rows, uber: null }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const live = await uberGet<Record<string, unknown>>(
        cfg,
        `/customers/${cfg.customerId}/deliveries/${uberId}`
      );

      return new Response(
        JSON.stringify({
          ok: true,
          action: "inspect",
          delivery_id: uberId,
          db_deliveries: rows,
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
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (action === "cancel") {
      const deliveryId =
        payload.delivery_id ||
        (await db
          .from("deliveries")
          .select("tracking_id,uber_delivery_id,meta")
          .eq("provider", "uber")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => data?.uber_delivery_id || data?.tracking_id || (data?.meta as { raw?: { id?: string } })?.raw?.id));

      if (!deliveryId) {
        return new Response(JSON.stringify({ error: "no_delivery_id" }), { status: 404 });
      }

      const canceled = await uberPost<Record<string, unknown>>(
        cfg,
        `/customers/${cfg.customerId}/deliveries/${deliveryId}/cancel`
      );

      await db
        .from("deliveries")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .or(`tracking_id.eq.${deliveryId},uber_delivery_id.eq.${deliveryId}`);

      await db
        .from("orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("order_id", String(canceled.external_id || ""));

      return new Response(
        JSON.stringify({
          ok: true,
          action: "cancel",
          delivery_id: deliveryId,
          uber_status: canceled.status,
          complete: canceled.complete,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "unknown_action", action }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, action, error: String(e) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
});
