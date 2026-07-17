import type { SupabaseClient } from "@supabase/supabase-js";
import { createRoutingDbAdapter } from "./routing/db-adapter";
import { selectOptimalDriverForOrder } from "./routing/dispatch-routing";
import type { ActiveOrderRef } from "./routing/types";
import { haversineKm } from "./routing/geo";
import { initializeRouteForOrder } from "./routing/uber-routing-ai";
import { handleDispatchAssigned } from "../delivery/handler";
import type { RealtimeRuntime } from "../logistics/delivery-realtime";
import { assignOrderToUberDirect } from "./uberDirect";
import { resolveUberDirectConfig } from "../server/uberDirectConfigStore";

export const OFFER_TTL_SECONDS = 20;
export const DRIVER_OFFER_RADIUS_KM = 15;
export const DRIVER_ONLINE_MAX_MINUTES = 5;

export type OfferStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled";

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

const TERMINAL_ORDER_STATUSES = ["delivered", "cancelled", "failed", "refunded", "complete"];

export function normalizeOrderId(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const fromPath = raw.match(/\/orders\/([^/?#]+)/i);
  if (fromPath) return fromPath[1];
  const hashMatch = raw.match(/#([a-zA-Z0-9_-]+)/);
  if (hashMatch) return hashMatch[1];
  const orderLabel = raw.match(/^order\s+#?\s*([a-zA-Z0-9_-]+)$/i);
  if (orderLabel) return orderLabel[1];
  return raw.split(/\s+/)[0].replace(/^#/, "");
}

/** Resolve UI short ids (e.g. 46f166) or full order_id (ord_…) to a single orders row. */
export async function resolveOrderId(db: SupabaseClient, input: string): Promise<string> {
  const token = normalizeOrderId(input);
  if (!token) throwErr("order_id required");

  const { data: exact } = await db.from("orders").select("order_id").eq("order_id", token).maybeSingle();
  if (exact?.order_id) return String(exact.order_id);

  if (token.length >= 4) {
    const { data: matches } = await db
      .from("orders")
      .select("order_id,created_at")
      .ilike("order_id", `%${token}`)
      .order("created_at", { ascending: false })
      .limit(10);

    const list = matches || [];
    const suffixHits = list.filter((o) => String(o.order_id).toLowerCase().endsWith(token.toLowerCase()));
    const pool = suffixHits.length ? suffixHits : list;

    if (pool.length === 1) return String(pool[0].order_id);
    if (pool.length > 1) {
      throwErr(`Multiple orders match "${token}" — paste the full order ID`, 409);
    }
  }

  throwErr(`Order not found for "${input}"`, 404);
}

async function isFounderDriverUser(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data: user } = await db.from("users").select("founder_driver,role").eq("user_id", userId).maybeSingle();
  return user?.founder_driver === true || user?.role === "admin";
}

export async function recordOfferEvent(
  db: SupabaseClient,
  orderId: string,
  eventType: string,
  opts: { offerId?: string; driverId?: string; message?: string; meta?: Record<string, unknown> } = {}
) {
  await db.from("driver_offer_events").insert({
    event_id: uid("ofe"),
    order_id: orderId,
    offer_id: opts.offerId,
    driver_id: opts.driverId,
    event_type: eventType,
    message: opts.message,
    meta: opts.meta || {},
    created_at: new Date().toISOString(),
  });
}

export async function pushDriverOfferBroadcast(
  driverId: string,
  payload: Record<string, unknown>,
  runtime?: RealtimeRuntime
) {
  const supabaseUrl = runtime?.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = runtime?.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        apikey: serviceKey,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `driver-offers:${driverId}`,
            event: "new_order_offer",
            payload: { ...payload, ts: new Date().toISOString() },
          },
        ],
      }),
    });
  } catch (e) {
    console.warn(JSON.stringify({ driver_offer_broadcast_failed: String(e), driver_id: driverId }));
  }
}

async function loadOrderForOffer(db: SupabaseClient, orderId: string) {
  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!order) throwErr("Order not found", 404);
  if (order.driver_id) throwErr("Order already has a driver", 409);
  if (order.delivery_type === "uber" || order.status === "assigned_uber") {
    throwErr("Order already assigned to Uber Direct", 409);
  }
  if (order.payment_status !== "paid") throwErr("Order not paid", 400);
  return order;
}

async function getExcludedDriverIds(db: SupabaseClient, orderId: string): Promise<string[]> {
  const { data } = await db
    .from("driver_order_offers")
    .select("driver_id")
    .eq("order_id", orderId)
    .in("status", ["declined", "expired"]);
  return [...new Set((data || []).map((r) => String(r.driver_id)))];
}

export async function isDriverEligibleForOffer(
  db: SupabaseClient,
  driver: Record<string, unknown>,
  restaurantLat: number,
  restaurantLng: number
): Promise<boolean> {
  if (!driver.availability) return false;
  if (Number(driver.workload || 0) > 0) return false;

  const lastSeen = driver.last_seen ? new Date(String(driver.last_seen)).getTime() : 0;
  if (Date.now() - lastSeen > DRIVER_ONLINE_MAX_MINUTES * 60_000) return false;

  const { data: activeOrders } = await db
    .from("orders")
    .select("order_id")
    .eq("driver_id", driver.driver_id)
    .in("status", ["assigned_internal", "arrived_at_store", "picked_up", "out_for_delivery", "arrived_at_customer"])
    .limit(1);
  if (activeOrders?.length) return false;

  const { data: pendingOffer } = await db
    .from("driver_order_offers")
    .select("offer_id")
    .eq("driver_id", driver.driver_id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (pendingOffer?.length) return false;

  const founderBypass = await isFounderDriverUser(db, String(driver.user_id));
  if (founderBypass) return true;

  const lat = Number(driver.latitude);
  const lng = Number(driver.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) return true;

  return haversineKm({ lat, lng }, { lat: restaurantLat, lng: restaurantLng }) <= DRIVER_OFFER_RADIUS_KM;
}

async function pickDriverForOrder(
  db: SupabaseClient,
  orderId: string,
  excludeDriverIds: string[]
): Promise<{ driver: Record<string, unknown>; proposal: { driverId: string; eta: number; earnings: number } | null } | null> {
  const routingDb = createRoutingDbAdapter(db);
  const orderRef = await routingDb.getOrderCoords?.(orderId);
  if (!orderRef) return null;

  const { data: restaurant } = orderRef.restaurant_id
    ? await db.from("restaurants").select("latitude,longitude").eq("restaurant_id", orderRef.restaurant_id).maybeSingle()
    : { data: null };

  const restLat = Number(restaurant?.latitude ?? orderRef.pickup.lat);
  const restLng = Number(restaurant?.longitude ?? orderRef.pickup.lng);

  const proposal = await selectOptimalDriverForOrder(db, routingDb, orderRef as ActiveOrderRef);
  const candidates: string[] = [];

  if (proposal && !excludeDriverIds.includes(proposal.driverId)) {
    candidates.push(proposal.driverId);
  }

  const { data: drivers } = await db
    .from("drivers")
    .select("*")
    .eq("availability", true)
    .order("workload", { ascending: true })
    .limit(20);

  for (const d of drivers || []) {
    if (!candidates.includes(d.driver_id) && !excludeDriverIds.includes(d.driver_id)) {
      candidates.push(d.driver_id);
    }
  }

  for (const driverId of candidates) {
    const { data: driver } = await db.from("drivers").select("*").eq("driver_id", driverId).maybeSingle();
    if (!driver) continue;
    if (await isDriverEligibleForOffer(db, driver, restLat, restLng)) {
      const p = proposal?.driverId === driverId ? proposal : null;
      return {
        driver,
        proposal: p
          ? { driverId: p.driverId, eta: p.eta, earnings: p.earnings }
          : { driverId, eta: 15, earnings: 8.5 },
      };
    }
  }

  return null;
}

export async function cancelPendingOffers(db: SupabaseClient, orderId: string, exceptOfferId?: string) {
  let q = db
    .from("driver_order_offers")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("status", "pending");
  if (exceptOfferId) q = q.neq("offer_id", exceptOfferId);
  await q;
}

export async function createAndBroadcastOffer(
  db: SupabaseClient,
  orderId: string,
  runtime?: RealtimeRuntime
): Promise<{ ok: boolean; offer_id?: string; driver_id?: string; reason?: string; uber_delivery_id?: string }> {
  const order = await loadOrderForOffer(db, orderId);
  if (order.driver_id) return { ok: false, reason: "already_assigned" };

  await cancelPendingOffers(db, orderId);

  const excluded = await getExcludedDriverIds(db, orderId);
  const pick = await pickDriverForOrder(db, orderId, excluded);
  if (!pick) {
    const uberCfg = await resolveUberDirectConfig(db);
    if (uberCfg?.enabled && uberCfg.backupEnabled) {
      try {
        const uber = await assignOrderToUberDirect(db, order, uberCfg);
        await recordOfferEvent(db, orderId, "uber_direct_fallback", {
          message: "No internal drivers — dispatched via Uber Direct",
          meta: { uber_delivery_id: uber.uber_delivery_id },
        });
        return { ok: true, reason: "uber_fallback", uber_delivery_id: uber.uber_delivery_id };
      } catch (e) {
        await recordOfferEvent(db, orderId, "uber_direct_failed", { message: String(e) });
      }
    }

    await recordOfferEvent(db, orderId, "no_drivers_available", { message: "No eligible drivers for offer" });
    return { ok: false, reason: "no_drivers" };
  }

  const { driver, proposal } = pick;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OFFER_TTL_SECONDS * 1000);
  const offerId = uid("offer");

  const routingDb = createRoutingDbAdapter(db);
  const orderRef = await routingDb.getOrderCoords?.(orderId);
  const distKm = orderRef
    ? haversineKm(
        { lat: Number(driver.latitude), lng: Number(driver.longitude) },
        orderRef.pickup
      ) + haversineKm(orderRef.pickup, orderRef.dropoff)
    : null;

  await db.from("driver_order_offers").insert({
    offer_id: offerId,
    order_id: orderId,
    driver_id: driver.driver_id,
    status: "pending",
    offered_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    estimated_distance_km: distKm,
    estimated_earnings: proposal?.earnings ?? 8.5,
    estimated_eta_min: Math.round(proposal?.eta ?? 20),
    meta: {
      restaurant_name: order.restaurant_name,
      customer_area: String(order.address || "").split(",").slice(-2).join(",").trim() || "Customer",
      pickup_address: order.restaurant_name,
    },
  });

  await db
    .from("orders")
    .update({
      current_offer_id: offerId,
      offer_round: Number(order.offer_round || 0) + 1,
      updated_at: now.toISOString(),
    })
    .eq("order_id", orderId);

  await recordOfferEvent(db, orderId, "offer_sent", {
    offerId,
    driverId: String(driver.driver_id),
    message: "Offer sent to driver",
    meta: { expires_at: expiresAt.toISOString() },
  });

  const payload = {
    offer_id: offerId,
    order_id: orderId,
    expires_at: expiresAt.toISOString(),
    ttl_seconds: OFFER_TTL_SECONDS,
    restaurant_name: order.restaurant_name,
    customer_area: String(order.address || "").split(",").slice(-2).join(",").trim() || "Customer",
    estimated_distance_km: distKm,
    estimated_earnings: proposal?.earnings ?? 8.5,
    estimated_eta_min: Math.round(proposal?.eta ?? 20),
    pickup_label: order.restaurant_name,
    dropoff_label: order.address,
  };

  await pushDriverOfferBroadcast(String(driver.driver_id), payload, runtime);

  return { ok: true, offer_id: offerId, driver_id: String(driver.driver_id) };
}

async function loadOrderForFounderAction(db: SupabaseClient, orderIdOrInput: string) {
  const orderId = await resolveOrderId(db, orderIdOrInput);
  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!order) throwErr("Order not found", 404);
  if (order.driver_id) throwErr("Order already has a driver", 409);
  if (order.delivery_type === "uber" || order.status === "assigned_uber") {
    throwErr("Uber Direct orders cannot be assigned internally", 400);
  }
  if (TERMINAL_ORDER_STATUSES.includes(String(order.status))) {
    throwErr(`Order is ${order.status} and cannot be assigned`, 400);
  }
  return order;
}

export async function createOfferForDriver(
  db: SupabaseClient,
  orderId: string,
  driverId: string,
  runtime?: RealtimeRuntime
): Promise<{ ok: boolean; offer_id?: string; driver_id?: string; reason?: string }> {
  const order = await loadOrderForFounderAction(db, orderId);
  const { data: driver } = await db.from("drivers").select("*").eq("driver_id", driverId).maybeSingle();
  if (!driver) throwErr("Driver not found", 404);

  await cancelPendingOffers(db, orderId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + OFFER_TTL_SECONDS * 1000);
  const offerId = uid("offer");

  const routingDb = createRoutingDbAdapter(db);
  const orderRef = await routingDb.getOrderCoords?.(orderId);
  const lat = Number(driver.latitude);
  const lng = Number(driver.longitude);
  const distKm = orderRef && Number.isFinite(lat) && Number.isFinite(lng)
    ? haversineKm({ lat, lng }, orderRef.pickup) + haversineKm(orderRef.pickup, orderRef.dropoff)
    : null;

  await db.from("driver_order_offers").insert({
    offer_id: offerId,
    order_id: orderId,
    driver_id: driverId,
    status: "pending",
    offered_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    estimated_distance_km: distKm,
    estimated_earnings: 8.5,
    estimated_eta_min: 20,
    meta: {
      restaurant_name: order.restaurant_name,
      customer_area: String(order.address || "").split(",").slice(-2).join(",").trim() || "Customer",
      pickup_address: order.restaurant_name,
      founder_offer: true,
    },
  });

  await db
    .from("orders")
    .update({
      current_offer_id: offerId,
      offer_round: Number(order.offer_round || 0) + 1,
      updated_at: now.toISOString(),
    })
    .eq("order_id", orderId);

  await recordOfferEvent(db, orderId, "offer_sent", {
    offerId,
    driverId,
    message: "Founder driver test offer",
    meta: { expires_at: expiresAt.toISOString(), founder_offer: true },
  });

  const payload = {
    offer_id: offerId,
    order_id: orderId,
    expires_at: expiresAt.toISOString(),
    ttl_seconds: OFFER_TTL_SECONDS,
    restaurant_name: order.restaurant_name,
    customer_area: String(order.address || "").split(",").slice(-2).join(",").trim() || "Customer",
    estimated_distance_km: distKm,
    estimated_earnings: 8.5,
    estimated_eta_min: 20,
    pickup_label: order.restaurant_name,
    dropoff_label: order.address,
  };

  await pushDriverOfferBroadcast(driverId, payload, runtime);

  return { ok: true, offer_id: offerId, driver_id: driverId };
}

const CLAIMABLE_ORDER_STATUSES = ["placed", "accepted", "preparing", "ready", "confirmed", "pending"];
const FOUNDER_CLAIMABLE_STATUSES = [
  "pending_payment", "pending", "placed", "confirmed", "accepted", "preparing", "ready",
];

export async function assignOrderToDriver(
  db: SupabaseClient,
  orderId: string,
  driver: Record<string, unknown>,
  runtime?: RealtimeRuntime,
  opts: { source?: string; founderForce?: boolean } = {}
) {
  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!order) throwErr("Order not found", 404);
  if (order.driver_id) throwErr("Order already has a driver", 409);
  if (order.delivery_type === "uber" || order.status === "assigned_uber") {
    throwErr("Uber Direct orders cannot be claimed internally", 400);
  }
  if (TERMINAL_ORDER_STATUSES.includes(String(order.status))) {
    throwErr(`Order is ${order.status} and cannot be assigned`, 400);
  }
  if (opts.founderForce) {
    if (!["paid", "pending", "initiated", "requires_payment", "processing"].includes(String(order.payment_status))) {
      throwErr(`Order payment status is ${order.payment_status} — cannot assign`, 400);
    }
  } else if (order.payment_status !== "paid") {
    throwErr("Order is not paid yet", 400);
  }

  const now = new Date().toISOString();
  const trackingId = `trk_${orderId}`;

  const { data: assigned, error: assignError } = await db
    .from("orders")
    .update({
      driver_id: driver.driver_id,
      status: "assigned_internal",
      delivery_type: "internal",
      tracking_id: trackingId,
      current_offer_id: null,
      updated_at: now,
    })
    .eq("order_id", orderId)
    .is("driver_id", null)
    .select("order_id, driver_id, status")
    .maybeSingle();

  if (assignError) throwErr(assignError.message, 500);
  if (!assigned) throwErr("Order could not be assigned — it may already have a driver", 409);

  await db
    .from("drivers")
    .update({
      availability: true,
      workload: Number(driver.workload || 0) + 1,
      last_seen: now,
    })
    .eq("driver_id", driver.driver_id);

  const { data: existingDelivery } = await db.from("deliveries").select("delivery_id").eq("order_id", orderId).maybeSingle();
  if (!existingDelivery) {
    await db.from("deliveries").insert({
      delivery_id: uid("dlv"),
      order_id: orderId,
      provider: "internal",
      tracking_id: trackingId,
      status: "assigned",
      driver_id: driver.driver_id,
    });
  } else {
    await db
      .from("deliveries")
      .update({ status: "assigned", driver_id: driver.driver_id, tracking_id: trackingId })
      .eq("order_id", orderId);
  }

  await cancelPendingOffers(db, orderId);

  const routingDb = createRoutingDbAdapter(db);
  const orderRef = await routingDb.getOrderCoords?.(orderId);
  if (orderRef) {
    try {
      await initializeRouteForOrder(
        routingDb,
        String(driver.driver_id),
        orderRef,
        { lat: Number(driver.latitude) || 0, lng: Number(driver.longitude) || 0 },
        runtime
      );
    } catch (e) {
      console.warn(JSON.stringify({ assign_route_init_skipped: String(e) }));
    }
  }

  try {
    await handleDispatchAssigned(db, orderId, String(driver.driver_id), runtime);
  } catch (e) {
    console.warn(JSON.stringify({ dispatch_assigned_event_skipped: String(e) }));
  }

  return {
    ok: true,
    order_id: orderId,
    status: "assigned_internal",
    driver_id: driver.driver_id,
    navigate_to: `/driver/navigate/${orderId}`,
  };
}

export async function listClaimableOrders(db: SupabaseClient, limit = 20, opts: { founderMode?: boolean } = {}) {
  let q = db
    .from("orders")
    .select("order_id,restaurant_name,customer_name,address,total,status,payment_status,created_at")
    .is("driver_id", null)
    .or("delivery_type.is.null,delivery_type.neq.uber")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.founderMode) {
    q = q
      .in("payment_status", ["paid", "pending", "initiated", "requires_payment", "processing"])
      .in("status", FOUNDER_CLAIMABLE_STATUSES);
  } else {
    q = q.eq("payment_status", "paid").in("status", CLAIMABLE_ORDER_STATUSES);
  }

  const { data } = await q;
  return data || [];
}

export async function acceptDriverOffer(
  db: SupabaseClient,
  offerId: string,
  driverUserId: string,
  deviceId: string,
  runtime?: RealtimeRuntime
) {
  const { data: d } = await db.from("drivers").select("*").eq("user_id", driverUserId).maybeSingle();
  if (!d) throwErr("No driver profile", 404);

  const { data: offer } = await db.from("driver_order_offers").select("*").eq("offer_id", offerId).maybeSingle();
  if (!offer) throwErr("Offer not found", 404);
  if (offer.driver_id !== d.driver_id) throwErr("Not your offer", 403);
  if (offer.status !== "pending") throwErr(`Offer is ${offer.status}`, 409);
  if (new Date(String(offer.expires_at)).getTime() < Date.now()) {
    await db.from("driver_order_offers").update({ status: "expired", responded_at: new Date().toISOString() }).eq("offer_id", offerId);
    throwErr("Offer expired", 410);
  }

  if (offer.locked_device_id && offer.locked_device_id !== deviceId) {
    throwErr("Offer is active on another device", 409);
  }

  const { data: order } = await db.from("orders").select("*").eq("order_id", offer.order_id).maybeSingle();
  if (!order) throwErr("Order not found", 404);
  if (order.driver_id) throwErr("Order already assigned", 409);

  const now = new Date().toISOString();
  const responseMs = Date.now() - new Date(String(offer.offered_at)).getTime();

  const { data: updated } = await db
    .from("driver_order_offers")
    .update({
      status: "accepted",
      responded_at: now,
      response_ms: responseMs,
      locked_device_id: deviceId,
    })
    .eq("offer_id", offerId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (!updated) throwErr("Could not accept offer — it may have expired", 409);

  const offerMeta = offer.meta && typeof offer.meta === "object" ? (offer.meta as Record<string, unknown>) : {};
  const founderForce = Boolean(offerMeta.founder_offer) || await isFounderDriverUser(db, driverUserId);
  const result = await assignOrderToDriver(db, String(offer.order_id), d, runtime, { founderForce });

  await recordOfferEvent(db, offer.order_id, "accepted", {
    offerId,
    driverId: d.driver_id,
    message: "Driver accepted offer",
    meta: { response_ms: responseMs },
  });

  await pushDriverOfferBroadcast(d.driver_id, { event: "offer_accepted", offer_id: offerId, order_id: offer.order_id }, runtime);

  return result;
}

export async function declineDriverOffer(
  db: SupabaseClient,
  offerId: string,
  driverUserId: string,
  runtime?: RealtimeRuntime
) {
  const { data: d } = await db.from("drivers").select("driver_id").eq("user_id", driverUserId).maybeSingle();
  if (!d) throwErr("No driver profile", 404);

  const { data: offer } = await db.from("driver_order_offers").select("*").eq("offer_id", offerId).maybeSingle();
  if (!offer) throwErr("Offer not found", 404);
  if (offer.driver_id !== d.driver_id) throwErr("Not your offer", 403);
  if (offer.status !== "pending") return { ok: true, status: offer.status };

  const now = new Date().toISOString();
  await db
    .from("driver_order_offers")
    .update({ status: "declined", responded_at: now, response_ms: Date.now() - new Date(String(offer.offered_at)).getTime() })
    .eq("offer_id", offerId);

  await recordOfferEvent(db, offer.order_id, "declined", {
    offerId,
    driverId: d.driver_id,
    message: "Driver declined offer",
  });

  const next = await createAndBroadcastOffer(db, offer.order_id, runtime);
  return { ok: true, status: "declined", next };
}

export async function expireDriverOffer(
  db: SupabaseClient,
  offerId: string,
  driverUserId: string,
  runtime?: RealtimeRuntime
) {
  const { data: d } = await db.from("drivers").select("driver_id").eq("user_id", driverUserId).maybeSingle();
  if (!d) throwErr("No driver profile", 404);

  const { data: offer } = await db.from("driver_order_offers").select("*").eq("offer_id", offerId).maybeSingle();
  if (!offer) throwErr("Offer not found", 404);
  if (offer.driver_id !== d.driver_id) throwErr("Not your offer", 403);
  if (offer.status !== "pending") return { ok: true, status: offer.status };

  const now = new Date().toISOString();
  await db
    .from("driver_order_offers")
    .update({ status: "expired", responded_at: now })
    .eq("offer_id", offerId)
    .eq("status", "pending");

  await recordOfferEvent(db, offer.order_id, "expired", {
    offerId,
    driverId: d.driver_id,
    message: "Offer expired",
  });

  const { data: order } = await db.from("orders").select("driver_id").eq("order_id", offer.order_id).maybeSingle();
  if (order?.driver_id) return { ok: true, status: "expired", assigned: true };

  const next = await createAndBroadcastOffer(db, offer.order_id, runtime);
  return { ok: true, status: "expired", next };
}

export async function lockOfferToDevice(db: SupabaseClient, offerId: string, driverId: string, deviceId: string) {
  const { data: offer } = await db.from("driver_order_offers").select("*").eq("offer_id", offerId).maybeSingle();
  if (!offer || offer.driver_id !== driverId || offer.status !== "pending") return offer;

  if (!offer.locked_device_id) {
    await db.from("driver_order_offers").update({ locked_device_id: deviceId }).eq("offer_id", offerId).is("locked_device_id", null);
    const { data: refreshed } = await db.from("driver_order_offers").select("*").eq("offer_id", offerId).maybeSingle();
    return refreshed;
  }

  return offer;
}

export async function getActiveOfferForDriver(db: SupabaseClient, driverId: string) {
  const { data } = await db
    .from("driver_order_offers")
    .select("*")
    .eq("driver_id", driverId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("offered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getOfferStatsForAdmin(db: SupabaseClient, orderId?: string) {
  let q = db.from("driver_offer_events").select("*").order("created_at", { ascending: false }).limit(100);
  if (orderId) q = q.eq("order_id", orderId);
  const { data: events } = await q;

  const { data: offers } = orderId
    ? await db.from("driver_order_offers").select("*").eq("order_id", orderId).order("offered_at", { ascending: true })
    : await db.from("driver_order_offers").select("*").order("offered_at", { ascending: false }).limit(50);

  const accepted = (offers || []).filter((o) => o.status === "accepted");
  const avgResponse =
    accepted.length > 0
      ? Math.round(accepted.reduce((s, o) => s + Number(o.response_ms || 0), 0) / accepted.length)
      : null;

  return { events: events || [], offers: offers || [], avg_acceptance_ms: avgResponse };
}
