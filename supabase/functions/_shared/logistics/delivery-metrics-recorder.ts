import type { SupabaseClient } from "@supabase/supabase-js";
import { metersBetween } from "../routing/geo.ts";
import { ARRIVED_FEET, ARRIVING_SOON_FEET } from "./driver-approach-alerts.ts";

const METERS_TO_FEET = 3.28084;

export type DeliveryMetrics = {
  id?: number;
  order_id: string;
  restaurant_prepare_time: number;
  driver_wait_time: number;
  pickup_duration: number;
  travel_time: number;
  total_delivery_time: number;
  created_at: string;
};

type GpsSample = { lat: number; lng: number; created_at: string };

type RestaurantProximity = {
  firstApproach: Date | null;
  firstArrived: Date | null;
  lastAtRestaurant: Date | null;
};

function parseTs(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

function minutesBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}

function clampMinutes(value: number | null | undefined, min = 0, max = 180): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function feetToRestaurant(sample: GpsSample, restaurant: { lat: number; lng: number }): number {
  return metersBetween({ lat: sample.lat, lng: sample.lng }, restaurant) * METERS_TO_FEET;
}

function analyzeRestaurantProximity(
  samples: GpsSample[],
  restaurant: { lat: number; lng: number }
): RestaurantProximity {
  let firstApproach: Date | null = null;
  let firstArrived: Date | null = null;
  let lastAtRestaurant: Date | null = null;

  for (const sample of samples) {
    const feet = feetToRestaurant(sample, restaurant);
    const ts = parseTs(sample.created_at);
    if (!ts) continue;

    if (feet <= ARRIVING_SOON_FEET) {
      if (!firstApproach) firstApproach = ts;
      lastAtRestaurant = ts;
    }
    if (feet <= ARRIVED_FEET && !firstArrived) {
      firstArrived = ts;
    }
  }

  return { firstApproach, firstArrived, lastAtRestaurant };
}

async function loadGpsTrail(db: SupabaseClient, orderId: string): Promise<GpsSample[]> {
  const { data } = await db
    .from("driver_gps_samples")
    .select("lat,lng,created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  return (data || [])
    .map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lng),
      created_at: String(row.created_at),
    }))
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
}

async function resolveRestaurantCoords(
  db: SupabaseClient,
  order: Record<string, unknown>
): Promise<{ lat: number; lng: number } | null> {
  let lat = Number(order.restaurant_lat);
  let lng = Number(order.restaurant_lng);

  if ((!lat || !lng) && order.restaurant_id) {
    const { data: restaurant } = await db
      .from("restaurants")
      .select("latitude,longitude")
      .eq("restaurant_id", order.restaurant_id)
      .maybeSingle();
    lat = Number(restaurant?.latitude);
    lng = Number(restaurant?.longitude);
  }

  if (!lat || !lng) return null;
  return { lat, lng };
}

/**
 * Derive per-order logistics timing metrics from orders, deliveries, GPS, and founder pickup logs.
 */
export async function buildDeliveryMetrics(
  db: SupabaseClient,
  orderId: string,
  completedAt: Date = new Date()
): Promise<DeliveryMetrics | null> {
  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!order) return null;

  const { data: delivery } = await db
    .from("deliveries")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: founderPickup } = await db
    .from("founder_pickup_logs")
    .select("arrival_at,food_ready_at,pickup_at,wait_minutes")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: route } = await db
    .from("delivery_routes")
    .select("delivery_duration")
    .eq("order_id", orderId)
    .maybeSingle();

  const orderCreated = parseTs(order.created_at);
  const deliveredAt =
    parseTs(delivery?.completion_time) ||
    parseTs(delivery?.delivery_time) ||
    parseTs(order.updated_at) ||
    completedAt;

  const pickupAt =
    parseTs(delivery?.pickup_time) ||
    parseTs(founderPickup?.pickup_at) ||
    null;

  const restaurant = await resolveRestaurantCoords(db, order);
  const gpsTrail = await loadGpsTrail(db, orderId);
  const proximity = restaurant
    ? analyzeRestaurantProximity(gpsTrail, restaurant)
    : { firstApproach: null, firstArrived: null, lastAtRestaurant: null };

  const readyAt =
    parseTs(founderPickup?.food_ready_at) ||
    parseTs(delivery?.created_at) ||
    proximity.firstApproach ||
    (orderCreated && pickupAt
      ? new Date(orderCreated.getTime() + (pickupAt.getTime() - orderCreated.getTime()) * 0.5)
      : null);

  const driverArrival =
    parseTs(founderPickup?.arrival_at) ||
    proximity.firstArrived ||
    proximity.firstApproach ||
    parseTs(delivery?.created_at);

  const resolvedPickupAt = pickupAt || proximity.lastAtRestaurant || parseTs(order.updated_at);

  const totalDeliveryTime = clampMinutes(minutesBetween(orderCreated, deliveredAt), 1);

  let restaurantPrepareTime = clampMinutes(minutesBetween(orderCreated, readyAt));
  if (!restaurantPrepareTime && orderCreated && resolvedPickupAt) {
    const prePickup = minutesBetween(orderCreated, resolvedPickupAt);
    if (prePickup != null) {
      restaurantPrepareTime = clampMinutes(prePickup * 0.55, 5, 60);
    }
  }
  if (!restaurantPrepareTime) {
    restaurantPrepareTime = clampMinutes(totalDeliveryTime * 0.35, 8, 45);
  }

  let driverWaitTime =
    founderPickup?.wait_minutes != null
      ? clampMinutes(Number(founderPickup.wait_minutes))
      : clampMinutes(minutesBetween(readyAt, resolvedPickupAt));

  if (!driverWaitTime && driverArrival && resolvedPickupAt) {
    driverWaitTime = clampMinutes(minutesBetween(driverArrival, resolvedPickupAt));
  }

  let pickupDuration = clampMinutes(
    minutesBetween(proximity.firstArrived || proximity.firstApproach, resolvedPickupAt)
  );
  if (!pickupDuration && driverArrival && resolvedPickupAt) {
    pickupDuration = clampMinutes(minutesBetween(driverArrival, resolvedPickupAt));
  }
  if (!pickupDuration) {
    pickupDuration = Math.min(8, Math.max(2, driverWaitTime || 3));
  }

  const travelStart = resolvedPickupAt || proximity.lastAtRestaurant;
  let travelTime = clampMinutes(minutesBetween(travelStart, deliveredAt));
  if (!travelTime && route?.delivery_duration != null) {
    travelTime = clampMinutes(Number(route.delivery_duration), 1);
  }
  if (!travelTime && totalDeliveryTime) {
    travelTime = clampMinutes(
      totalDeliveryTime - restaurantPrepareTime - driverWaitTime,
      1
    );
  }

  return {
    order_id: orderId,
    restaurant_prepare_time: restaurantPrepareTime,
    driver_wait_time: driverWaitTime,
    pickup_duration: pickupDuration,
    travel_time: travelTime,
    total_delivery_time: totalDeliveryTime,
    created_at: completedAt.toISOString(),
  };
}

/**
 * Persist delivery intelligence metrics when an order is completed.
 * Idempotent per order_id.
 */
export async function recordDeliveryMetrics(
  db: SupabaseClient,
  orderId: string,
  completedAt: Date = new Date()
): Promise<DeliveryMetrics | null> {
  try {
    const { data: existing } = await db
      .from("delivery_metrics")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();
    if (existing) return null;

    const metrics = await buildDeliveryMetrics(db, orderId, completedAt);
    if (!metrics) return null;

    const { data, error } = await db
      .from("delivery_metrics")
      .insert({
        order_id: metrics.order_id,
        restaurant_prepare_time: metrics.restaurant_prepare_time,
        driver_wait_time: metrics.driver_wait_time,
        pickup_duration: metrics.pickup_duration,
        travel_time: metrics.travel_time,
        total_delivery_time: metrics.total_delivery_time,
        created_at: metrics.created_at,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      console.warn(JSON.stringify({ delivery_metrics_skipped: error.message, order_id: orderId }));
      return null;
    }

    return data
      ? {
          id: data.id,
          order_id: data.order_id,
          restaurant_prepare_time: Number(data.restaurant_prepare_time),
          driver_wait_time: Number(data.driver_wait_time),
          pickup_duration: Number(data.pickup_duration),
          travel_time: Number(data.travel_time),
          total_delivery_time: Number(data.total_delivery_time),
          created_at: String(data.created_at),
        }
      : metrics;
  } catch (e) {
    console.warn(JSON.stringify({ delivery_metrics_skipped: String(e), order_id: orderId }));
    return null;
  }
}

/** Aggregate timing stats for ETA / prep prediction (optionally scoped by restaurant). */
export async function getDeliveryMetricsIntelligenceStats(
  db: SupabaseClient,
  opts: { restaurantId?: string; limit?: number } = {}
) {
  const limit = opts.limit ?? 50;

  if (opts.restaurantId) {
    const { data: orders } = await db
      .from("orders")
      .select("order_id")
      .eq("restaurant_id", opts.restaurantId)
      .eq("status", "delivered")
      .order("updated_at", { ascending: false })
      .limit(limit);

    const orderIds = (orders || []).map((o) => o.order_id).filter(Boolean);
    if (!orderIds.length) {
      return emptyMetricsStats();
    }

    const { data } = await db
      .from("delivery_metrics")
      .select(
        "restaurant_prepare_time,driver_wait_time,pickup_duration,travel_time,total_delivery_time,created_at"
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    return summarizeMetricsRows(data || []);
  }

  const { data } = await db
    .from("delivery_metrics")
    .select(
      "restaurant_prepare_time,driver_wait_time,pickup_duration,travel_time,total_delivery_time,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return summarizeMetricsRows(data || []);
}

function emptyMetricsStats() {
  return {
    sample_count: 0,
    avg_restaurant_prepare_min: null,
    avg_driver_wait_min: null,
    avg_pickup_duration_min: null,
    avg_travel_min: null,
    avg_total_delivery_min: null,
  };
}

function summarizeMetricsRows(
  rows: Array<{
    restaurant_prepare_time?: number | null;
    driver_wait_time?: number | null;
    pickup_duration?: number | null;
    travel_time?: number | null;
    total_delivery_time?: number | null;
  }>
) {
  if (!rows.length) return emptyMetricsStats();

  const sum = rows.reduce(
    (acc, row) => ({
      prep: acc.prep + Number(row.restaurant_prepare_time || 0),
      wait: acc.wait + Number(row.driver_wait_time || 0),
      pickup: acc.pickup + Number(row.pickup_duration || 0),
      travel: acc.travel + Number(row.travel_time || 0),
      total: acc.total + Number(row.total_delivery_time || 0),
    }),
    { prep: 0, wait: 0, pickup: 0, travel: 0, total: 0 }
  );

  const n = rows.length;
  const round1 = (v: number) => Math.round(v * 10) / 10;

  return {
    sample_count: n,
    avg_restaurant_prepare_min: round1(sum.prep / n),
    avg_driver_wait_min: round1(sum.wait / n),
    avg_pickup_duration_min: round1(sum.pickup / n),
    avg_travel_min: round1(sum.travel / n),
    avg_total_delivery_min: round1(sum.total / n),
  };
}
