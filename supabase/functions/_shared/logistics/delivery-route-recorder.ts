import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineKm } from "../routing/geo";

const KM_TO_MILES = 0.621371;

export type RouteCoordinates = { lat: number; lng: number };

export type CompletedDeliveryRoute = {
  id?: number;
  driver_id: string;
  order_id: string;
  pickup_coordinates: RouteCoordinates;
  dropoff_coordinates: RouteCoordinates;
  distance_miles: number;
  delivery_duration: number;
  average_speed: number;
  completed_at: string;
};

type GpsSample = { lat: number; lng: number; created_at: string; speed_mps?: number | null };

function kmToMiles(km: number): number {
  return Math.round(km * KM_TO_MILES * 100) / 100;
}

function pathDistanceMiles(samples: GpsSample[]): number {
  if (samples.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < samples.length; i++) {
    km += haversineKm(
      { lat: samples[i - 1].lat, lng: samples[i - 1].lng },
      { lat: samples[i].lat, lng: samples[i].lng }
    );
  }
  return kmToMiles(km);
}

function durationMinutesFromSamples(samples: GpsSample[], completedAt: Date): number {
  if (samples.length >= 2) {
    const start = new Date(samples[0].created_at).getTime();
    const end = new Date(samples[samples.length - 1].created_at).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(1, Math.round((end - start) / 60000));
    }
  }
  return 1;
}

function averageSpeedMph(distanceMiles: number, durationMin: number): number {
  if (durationMin <= 0 || distanceMiles <= 0) return 0;
  const hours = durationMin / 60;
  return Math.round((distanceMiles / hours) * 10) / 10;
}

async function loadGpsTrail(db: SupabaseClient, orderId: string): Promise<GpsSample[]> {
  const { data } = await db
    .from("driver_gps_samples")
    .select("lat,lng,created_at,speed_mps")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  return (data || [])
    .map((s) => ({
      lat: Number(s.lat),
      lng: Number(s.lng),
      created_at: String(s.created_at),
      speed_mps: s.speed_mps != null ? Number(s.speed_mps) : null,
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

async function resolveCoordinates(
  db: SupabaseClient,
  order: Record<string, unknown>
): Promise<{ pickup: RouteCoordinates; dropoff: RouteCoordinates } | null> {
  const dropoff: RouteCoordinates = {
    lat: Number(order.customer_lat),
    lng: Number(order.customer_lng),
  };
  if (!dropoff.lat || !dropoff.lng) return null;

  let pickupLat = Number(order.restaurant_lat);
  let pickupLng = Number(order.restaurant_lng);

  if ((!pickupLat || !pickupLng) && order.restaurant_id) {
    const { data: rest } = await db
      .from("restaurants")
      .select("latitude,longitude")
      .eq("restaurant_id", order.restaurant_id)
      .maybeSingle();
    pickupLat = Number(rest?.latitude);
    pickupLng = Number(rest?.longitude);
  }

  if (!pickupLat || !pickupLng) return null;

  return {
    pickup: { lat: pickupLat, lng: pickupLng },
    dropoff,
  };
}

export async function buildCompletedDeliveryRoute(
  db: SupabaseClient,
  orderId: string,
  driverId: string,
  completedAt: Date = new Date()
): Promise<CompletedDeliveryRoute | null> {
  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!order) return null;

  const coords = await resolveCoordinates(db, order);
  if (!coords) return null;

  const gpsTrail = await loadGpsTrail(db, orderId);
  let distanceMiles = pathDistanceMiles(gpsTrail);

  if (distanceMiles <= 0) {
    distanceMiles = kmToMiles(
      haversineKm(coords.pickup, coords.dropoff)
    );
  }

  let durationMin = durationMinutesFromSamples(gpsTrail, completedAt);

  if (durationMin <= 1 && order.updated_at && order.created_at) {
    const start = new Date(String(order.created_at)).getTime();
    const end = completedAt.getTime();
    if (end > start) {
      durationMin = Math.max(1, Math.min(180, Math.round((end - start) / 60000)));
    }
  }

  const avgSpeed = averageSpeedMph(distanceMiles, durationMin);

  return {
    driver_id: driverId,
    order_id: orderId,
    pickup_coordinates: coords.pickup,
    dropoff_coordinates: coords.dropoff,
    distance_miles: distanceMiles,
    delivery_duration: durationMin,
    average_speed: avgSpeed,
    completed_at: completedAt.toISOString(),
  };
}

/**
 * Persist a completed delivery route for optimization analytics.
 * Idempotent per order_id.
 */
export async function recordCompletedDeliveryRoute(
  db: SupabaseClient,
  orderId: string,
  driverId?: string | null
): Promise<CompletedDeliveryRoute | null> {
  try {
    const { data: existing } = await db
      .from("delivery_routes")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();
    if (existing) return null;

    const { data: order } = await db.from("orders").select("driver_id").eq("order_id", orderId).maybeSingle();
    const resolvedDriverId = driverId || (order?.driver_id as string | undefined);
    if (!resolvedDriverId) return null;

    const route = await buildCompletedDeliveryRoute(db, orderId, resolvedDriverId);
    if (!route) return null;

    const { data, error } = await db
      .from("delivery_routes")
      .insert({
        driver_id: route.driver_id,
        order_id: route.order_id,
        pickup_coordinates: route.pickup_coordinates,
        dropoff_coordinates: route.dropoff_coordinates,
        distance_miles: route.distance_miles,
        delivery_duration: route.delivery_duration,
        average_speed: route.average_speed,
        completed_at: route.completed_at,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      console.warn(JSON.stringify({ delivery_route_record_skipped: error.message, order_id: orderId }));
      return null;
    }

    return data
      ? {
          id: data.id,
          driver_id: data.driver_id,
          order_id: data.order_id,
          pickup_coordinates: data.pickup_coordinates as RouteCoordinates,
          dropoff_coordinates: data.dropoff_coordinates as RouteCoordinates,
          distance_miles: Number(data.distance_miles),
          delivery_duration: Number(data.delivery_duration),
          average_speed: Number(data.average_speed),
          completed_at: String(data.completed_at),
        }
      : route;
  } catch (e) {
    console.warn(JSON.stringify({ delivery_route_record_skipped: String(e), order_id: orderId }));
    return null;
  }
}

/** Aggregate stats for routing optimization (driver or restaurant scoped). */
export async function getDeliveryRouteOptimizationStats(
  db: SupabaseClient,
  opts: { driverId?: string; limit?: number } = {}
) {
  const limit = opts.limit ?? 50;
  let query = db
    .from("delivery_routes")
    .select("distance_miles,delivery_duration,average_speed,completed_at")
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (opts.driverId) query = query.eq("driver_id", opts.driverId);

  const { data } = await query;
  const rows = data || [];
  if (!rows.length) {
    return {
      sample_count: 0,
      avg_distance_miles: null,
      avg_duration_min: null,
      avg_speed_mph: null,
    };
  }

  const sum = rows.reduce(
    (acc, r) => ({
      dist: acc.dist + Number(r.distance_miles || 0),
      dur: acc.dur + Number(r.delivery_duration || 0),
      spd: acc.spd + Number(r.average_speed || 0),
    }),
    { dist: 0, dur: 0, spd: 0 }
  );

  const n = rows.length;
  return {
    sample_count: n,
    avg_distance_miles: Math.round((sum.dist / n) * 100) / 100,
    avg_duration_min: Math.round((sum.dur / n) * 10) / 10,
    avg_speed_mph: Math.round((sum.spd / n) * 10) / 10,
  };
}
