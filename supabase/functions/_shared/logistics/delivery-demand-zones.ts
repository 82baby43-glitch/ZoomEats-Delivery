import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemandHotspot } from "./types.ts";

export type DemandZoneLevel = "high" | "medium" | "low";

export type DeliveryDemandZone = {
  id?: number;
  latitude: number;
  longitude: number;
  order_count: number;
  time_window: string;
  demand_score: number;
  created_at: string;
};

const TIME_WINDOW_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

const DEFAULT_TIME_WINDOW = "1h";
const REFRESH_STALE_MS = 10 * 60 * 1000;
const GRID_PRECISION = 2;

export function demandLevelFromScore(score: number, orderCount: number): DemandZoneLevel {
  if (orderCount >= 5 || score >= 70) return "high";
  if (orderCount >= 2 || score >= 35) return "medium";
  return "low";
}

export function demandLabelFromLevel(level: DemandZoneLevel): string {
  if (level === "high") return "🔥 High demand area";
  if (level === "medium") return "🟡 Medium demand";
  return "🟢 Low demand";
}

function gridKey(lat: number, lng: number): string {
  return `${lat.toFixed(GRID_PRECISION)},${lng.toFixed(GRID_PRECISION)}`;
}

function windowHours(timeWindow: string): number {
  const ms = TIME_WINDOW_MS[timeWindow] ?? TIME_WINDOW_MS[DEFAULT_TIME_WINDOW];
  return ms / (60 * 60 * 1000);
}

function computeDemandScore(orderCount: number, timeWindow: string): number {
  const hours = windowHours(timeWindow);
  const ordersPerHour = orderCount / Math.max(hours, 0.25);
  return Math.min(100, Math.round(ordersPerHour * 15));
}

function ordersPerHourEstimate(orderCount: number, timeWindow: string): number {
  const hours = windowHours(timeWindow);
  return Math.max(1, Math.round(orderCount / Math.max(hours, 0.25)));
}

export function zonesToHotspots(
  zones: DeliveryDemandZone[],
  timeWindow: string = DEFAULT_TIME_WINDOW
): DemandHotspot[] {
  return zones.map((zone) => {
    const orderCount = Number(zone.order_count);
    const score = Number(zone.demand_score);
    const level = demandLevelFromScore(score, orderCount);
    return {
      id: `zone_${zone.id ?? `${zone.latitude}_${zone.longitude}`}`,
      lat: Number(zone.latitude),
      lng: Number(zone.longitude),
      level,
      label: demandLabelFromLevel(level),
      orders_per_hour: ordersPerHourEstimate(orderCount, timeWindow),
    };
  });
}

/**
 * Recompute demand zones from recent order drop-off coordinates.
 * Replaces the previous snapshot for the given time window.
 */
export async function refreshDeliveryDemandZones(
  db: SupabaseClient,
  timeWindow: string = DEFAULT_TIME_WINDOW,
  opts: { force?: boolean; staleAfterMs?: number } = {}
): Promise<number> {
  const staleAfterMs = opts.staleAfterMs ?? REFRESH_STALE_MS;

  if (!opts.force) {
    const { data: latest } = await db
      .from("delivery_demand_zones")
      .select("created_at")
      .eq("time_window", timeWindow)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest?.created_at) {
      const age = Date.now() - new Date(String(latest.created_at)).getTime();
      if (age < staleAfterMs) return 0;
    }
  }

  const windowMs = TIME_WINDOW_MS[timeWindow] ?? TIME_WINDOW_MS[DEFAULT_TIME_WINDOW];
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data: orders } = await db
    .from("orders")
    .select("customer_lat,customer_lng,created_at")
    .gte("created_at", since)
    .not("customer_lat", "is", null)
    .not("customer_lng", "is", null)
    .limit(500);

  const buckets = new Map<string, { lat: number; lng: number; order_count: number }>();

  for (const order of orders || []) {
    const lat = Number(order.customer_lat);
    const lng = Number(order.customer_lng);
    if (!lat || !lng) continue;

    const key = gridKey(lat, lng);
    const current = buckets.get(key) || {
      lat: Number(lat.toFixed(GRID_PRECISION)),
      lng: Number(lng.toFixed(GRID_PRECISION)),
      order_count: 0,
    };
    current.order_count += 1;
    buckets.set(key, current);
  }

  const batchAt = new Date().toISOString();
  const rows = [...buckets.values()].map((bucket) => ({
    latitude: bucket.lat,
    longitude: bucket.lng,
    order_count: bucket.order_count,
    time_window: timeWindow,
    demand_score: computeDemandScore(bucket.order_count, timeWindow),
    created_at: batchAt,
  }));

  try {
    await db.from("delivery_demand_zones").delete().eq("time_window", timeWindow);
    if (rows.length) {
      const { error } = await db.from("delivery_demand_zones").insert(rows);
      if (error) {
        console.warn(JSON.stringify({ delivery_demand_zones_refresh_skipped: error.message }));
        return 0;
      }
    }
    return rows.length;
  } catch (e) {
    console.warn(JSON.stringify({ delivery_demand_zones_refresh_skipped: String(e) }));
    return 0;
  }
}

export async function fetchLatestDeliveryDemandZones(
  db: SupabaseClient,
  timeWindow: string = DEFAULT_TIME_WINDOW
): Promise<DeliveryDemandZone[]> {
  const { data: latest } = await db
    .from("delivery_demand_zones")
    .select("created_at")
    .eq("time_window", timeWindow)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.created_at) return [];

  const { data: zones } = await db
    .from("delivery_demand_zones")
    .select("id,latitude,longitude,order_count,time_window,demand_score,created_at")
    .eq("time_window", timeWindow)
    .eq("created_at", latest.created_at)
    .order("demand_score", { ascending: false });

  return (zones || []).map((zone) => ({
    id: zone.id,
    latitude: Number(zone.latitude),
    longitude: Number(zone.longitude),
    order_count: Number(zone.order_count),
    time_window: String(zone.time_window),
    demand_score: Number(zone.demand_score),
    created_at: String(zone.created_at),
  }));
}

/** Load persisted demand zones as driver heat map hotspots (refreshes when stale). */
export async function fetchDeliveryDemandZonesAsHotspots(
  db: SupabaseClient,
  timeWindow: string = DEFAULT_TIME_WINDOW
): Promise<DemandHotspot[]> {
  await refreshDeliveryDemandZones(db, timeWindow);
  const zones = await fetchLatestDeliveryDemandZones(db, timeWindow);
  return zonesToHotspots(zones, timeWindow);
}

/** Aggregate demand intelligence for admin / dispatch dashboards. */
export async function getDeliveryDemandZoneStats(
  db: SupabaseClient,
  timeWindow: string = DEFAULT_TIME_WINDOW
) {
  const zones = await fetchLatestDeliveryDemandZones(db, timeWindow);
  if (!zones.length) {
    return {
      time_window: timeWindow,
      zone_count: 0,
      total_orders: 0,
      high_demand_zones: 0,
      medium_demand_zones: 0,
      low_demand_zones: 0,
      top_zone: null,
    };
  }

  let high = 0;
  let medium = 0;
  let low = 0;
  let totalOrders = 0;

  for (const zone of zones) {
    totalOrders += zone.order_count;
    const level = demandLevelFromScore(zone.demand_score, zone.order_count);
    if (level === "high") high += 1;
    else if (level === "medium") medium += 1;
    else low += 1;
  }

  const top = zones[0];
  return {
    time_window: timeWindow,
    zone_count: zones.length,
    total_orders: totalOrders,
    high_demand_zones: high,
    medium_demand_zones: medium,
    low_demand_zones: low,
    top_zone: top
      ? {
          latitude: top.latitude,
          longitude: top.longitude,
          order_count: top.order_count,
          demand_score: top.demand_score,
          level: demandLevelFromScore(top.demand_score, top.order_count),
        }
      : null,
  };
}
