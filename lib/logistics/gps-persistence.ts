import type { SupabaseClient } from "@supabase/supabase-js";
import type { GpsStreamState } from "../dispatch/routing/types";
import { getGpsStreamState } from "../dispatch/routing/gps-stream";
import type { OrderRoutingIntel } from "./route-state-helpers";

export async function persistDriverGpsSample(
  db: SupabaseClient,
  driverId: string,
  lat: number,
  lng: number,
  activeOrderId?: string | null
): Promise<void> {
  const stream = getGpsStreamState(driverId);
  try {
    await db.from("driver_gps_samples").insert({
      driver_id: driverId,
      order_id: activeOrderId ?? null,
      lat,
      lng,
      heading_deg: stream?.heading_deg ?? null,
      speed_mps: stream?.speed_mps ?? null,
    });
  } catch (e) {
    console.warn(JSON.stringify({ gps_sample_skipped: String(e) }));
  }
}

export async function persistOrderEtaSnapshot(
  db: SupabaseClient,
  orderId: string,
  driverId: string | null,
  driverLat: number | null,
  driverLng: number | null,
  routing: OrderRoutingIntel
): Promise<void> {
  try {
    await db.from("order_eta_snapshots").insert({
      order_id: orderId,
      driver_id: driverId,
      eta_pickup_min: routing.eta_pickup_min,
      eta_dropoff_min: routing.eta_dropoff_min,
      live_status: routing.live_status,
      driver_lat: driverLat,
      driver_lng: driverLng,
      heading_deg: routing.driver_heading_deg ?? null,
      speed_kmh: routing.speed_kmh ?? null,
      route_polyline: routing.route_polyline,
    });
  } catch (e) {
    console.warn(JSON.stringify({ eta_snapshot_skipped: String(e) }));
  }
}

export async function appendDeliveryRouteHistory(
  db: SupabaseClient,
  orderId: string,
  driverId: string,
  routePoints: Array<[number, number]>,
  totalDistanceKm?: number,
  totalEtaMin?: number | null
): Promise<void> {
  if (!routePoints.length) return;
  try {
    const { count } = await db
      .from("delivery_route_history")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .gte("created_at", new Date(Date.now() - 60000).toISOString());
    if ((count ?? 0) > 0) return;

    await db.from("delivery_route_history").insert({
      order_id: orderId,
      driver_id: driverId,
      route_points: routePoints,
      total_distance_km: totalDistanceKm ?? null,
      total_eta_min: totalEtaMin ?? null,
    });
  } catch (e) {
    console.warn(JSON.stringify({ route_history_skipped: String(e) }));
  }
}

export function gpsStreamToMarkerMeta(stream: GpsStreamState | null) {
  if (!stream) return {};
  return {
    heading_deg: stream.heading_deg,
    speed_kmh: Math.round(stream.speed_mps * 3.6 * 10) / 10,
  };
}
