/**
 * Uber Direct API client — Deno edge mirror of lib/dispatch/uberDirect.ts
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getUberDirectConfig, type UberDirectConfig } from "./uberDirectEnv.ts";

const AUTH_URL = "https://auth.uber.com/oauth/v2/token";
const API_BASE = "https://api.uber.com/v1";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export type UberManifestItem = {
  name: string;
  quantity: number;
  size?: "small" | "medium" | "large" | "xlarge";
  price: number;
};

export type UberDeliveryResult = {
  id: string;
  tracking_url?: string;
  status?: string;
  pickup_eta?: string;
  dropoff_eta?: string;
  quote_id?: string;
};

export type DispatchOrderContext = {
  orderId: string;
  customerName: string;
  customerAddress: string;
  customerLat?: number | null;
  customerLng?: number | null;
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  items: UberManifestItem[];
  manifestTotalCents: number;
};

function parseUsAddress(address: string) {
  const trimmed = (address || "").trim();
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZip) {
      return {
        street_address: [parts.slice(0, -2).join(", ") || parts[0]],
        city: parts[parts.length - 2],
        state: stateZip[1],
        zip_code: stateZip[2],
        country: "US",
      };
    }
  }
  return { street_address: [trimmed || "Unknown address"], country: "US" };
}

export function formatUberAddress(address: string): string {
  return JSON.stringify(parseUsAddress(address));
}

async function fetchAccessToken(cfg: UberDirectConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

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
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : `auth_${res.status}`;
    throw new Error(`uber_direct_auth_failed:${msg}`);
  }

  const token = data.access_token as string;
  const expiresIn = Number(data.expires_in ?? 3600);
  tokenCache = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}

async function uberFetch<T>(
  cfg: UberDirectConfig,
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const token = await fetchAccessToken(cfg);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.json ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    body: init.json ? JSON.stringify(init.json) : init.body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.message === "string" ? data.message : JSON.stringify(data).slice(0, 200);
    throw new Error(`uber_direct_api_${res.status}:${detail}`);
  }
  return data as T;
}

export async function createUberDeliveryQuote(
  cfg: UberDirectConfig,
  ctx: Pick<DispatchOrderContext, "customerAddress" | "restaurantAddress" | "customerLat" | "customerLng" | "pickupLat" | "pickupLng">
): Promise<{ id: string; fee?: number }> {
  const payload: Record<string, unknown> = {
    pickup_address: formatUberAddress(ctx.restaurantAddress),
    dropoff_address: formatUberAddress(ctx.customerAddress),
  };
  if (ctx.pickupLat != null && ctx.pickupLng != null) {
    payload.pickup_latitude = ctx.pickupLat;
    payload.pickup_longitude = ctx.pickupLng;
  }
  if (ctx.customerLat != null && ctx.customerLng != null) {
    payload.dropoff_latitude = ctx.customerLat;
    payload.dropoff_longitude = ctx.customerLng;
  }

  return uberFetch<{ id: string; fee?: number }>(
    cfg,
    `/customers/${cfg.customerId}/delivery_quotes`,
    { method: "POST", json: payload }
  );
}

export async function createUberDelivery(
  cfg: UberDirectConfig,
  ctx: DispatchOrderContext,
  quoteId?: string
): Promise<UberDeliveryResult> {
  const payload: Record<string, unknown> = {
    pickup_name: ctx.restaurantName,
    pickup_address: formatUberAddress(ctx.restaurantAddress),
    pickup_phone_number: ctx.restaurantPhone || cfg.defaultPhone,
    dropoff_name: ctx.customerName || "Customer",
    dropoff_address: formatUberAddress(ctx.customerAddress),
    dropoff_phone_number: cfg.defaultPhone,
    manifest_items: ctx.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      size: item.size || "small",
      price: item.price,
    })),
    manifest_total_value: ctx.manifestTotalCents,
    manifest_reference: ctx.orderId,
    idempotency_key: ctx.orderId,
  };

  if (quoteId) payload.quote_id = quoteId;
  if (ctx.pickupLat != null && ctx.pickupLng != null) {
    payload.pickup_latitude = ctx.pickupLat;
    payload.pickup_longitude = ctx.pickupLng;
  }
  if (ctx.customerLat != null && ctx.customerLng != null) {
    payload.dropoff_latitude = ctx.customerLat;
    payload.dropoff_longitude = ctx.customerLng;
  }

  const data = await uberFetch<{
    id: string;
    tracking_url?: string;
    status?: string;
    pickup_eta?: string;
    dropoff_eta?: string;
    quote_id?: string;
  }>(cfg, `/customers/${cfg.customerId}/deliveries`, { method: "POST", json: payload });

  return {
    id: data.id,
    tracking_url: data.tracking_url,
    status: data.status,
    pickup_eta: data.pickup_eta,
    dropoff_eta: data.dropoff_eta,
    quote_id: data.quote_id,
  };
}

export async function dispatchOrderViaUberDirect(
  ctx: DispatchOrderContext,
  cfg?: UberDirectConfig | null
): Promise<UberDeliveryResult> {
  const resolved = cfg ?? getUberDirectConfig();
  if (!resolved?.enabled) {
    throw new Error("uber_direct_not_configured");
  }

  let quoteId: string | undefined;
  try {
    const quote = await createUberDeliveryQuote(resolved, ctx);
    quoteId = quote.id;
  } catch (e) {
    console.warn(JSON.stringify({ uber_quote_skipped: String(e), order_id: ctx.orderId }));
  }

  return createUberDelivery(resolved, ctx, quoteId);
}

type OrderRow = {
  order_id: string;
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

export async function loadUberDispatchContext(
  db: SupabaseClient,
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

export async function assignOrderToUberDirect(
  db: SupabaseClient,
  order: OrderRow,
  cfg: UberDirectConfig
): Promise<{ uber_delivery_id: string; tracking_url?: string }> {
  const ctx = await loadUberDispatchContext(db, order);
  if (!ctx) {
    throw new Error("uber_context_missing");
  }

  const uberDelivery = await dispatchOrderViaUberDirect(ctx, cfg);
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
    throw new Error(updateError.message);
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

  return {
    uber_delivery_id: uberDelivery.id,
    tracking_url: uberDelivery.tracking_url,
  };
}

export type UberDeliverySnapshot = {
  id?: string;
  status?: string;
  complete?: boolean;
  live_mode?: boolean;
  pickup_eta?: string;
  dropoff_eta?: string;
  tracking_url?: string;
  external_id?: string;
};

export async function getUberDelivery(
  cfg: UberDirectConfig,
  deliveryId: string
): Promise<UberDeliverySnapshot> {
  return uberFetch<UberDeliverySnapshot>(
    cfg,
    `/customers/${cfg.customerId}/deliveries/${deliveryId}`
  );
}

export async function cancelUberDelivery(
  cfg: UberDirectConfig,
  deliveryId: string
): Promise<UberDeliverySnapshot> {
  return uberFetch<UberDeliverySnapshot>(
    cfg,
    `/customers/${cfg.customerId}/deliveries/${deliveryId}/cancel`,
    { method: "POST" }
  );
}

export async function verifyUberDirectConnection(
  cfg?: UberDirectConfig | null
): Promise<{ ok: boolean; error?: string }> {
  const resolved = cfg ?? getUberDirectConfig();
  if (!resolved) return { ok: false, error: "not_configured" };
  try {
    await fetchAccessToken(resolved);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function buildManifestFromOrderItems(
  items: Array<{ name?: string; quantity?: number; price?: number }> | null | undefined,
  totalDollars: number
): { items: UberManifestItem[]; manifestTotalCents: number } {
  const list = Array.isArray(items) ? items : [];
  const manifestItems: UberManifestItem[] = list.map((item) => ({
    name: String(item.name || "Item"),
    quantity: Math.max(1, Math.min(Number(item.quantity) || 1, 99)),
    size: "small" as const,
    price: Math.round((Number(item.price) || 0) * 100),
  }));

  if (!manifestItems.length) {
    manifestItems.push({ name: "Order", quantity: 1, size: "small", price: Math.round(totalDollars * 100) });
  }

  const manifestTotalCents = Math.max(
    manifestItems.reduce((sum, it) => sum + it.price * it.quantity, 0),
    Math.round(totalDollars * 100)
  );

  return { items: manifestItems, manifestTotalCents };
}
