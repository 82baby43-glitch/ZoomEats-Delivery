import type { SupabaseClient } from "@supabase/supabase-js";
import { getGpsStreamState } from "../routing/gps-stream.ts";
import { pushDeliveryEvent, type RealtimeRuntime } from "./delivery-realtime";

export type DriverTrackingMode = "offline" | "online" | "active_delivery";

export type DriverTrackingStatus = "offline" | "online" | "active_delivery";

export const TRACKING_INTERVAL_MS = {
  online: { min: 30_000, max: 60_000 },
  active_delivery: { min: 5_000, max: 10_000 },
} as const;

const ACTIVE_DELIVERY_STATUSES = [
  "ready",
  "assigned_internal",
  "assigned_uber",
  "picked_up",
  "out_for_delivery",
];

/** Throttle archival history rows — latest position uses upsert table. */
const LOCATION_HISTORY_MIN_INTERVAL_MS = 5 * 60_000;
const lastHistoryInsertMs = new Map<string, number>();

export function resolveTrackingMode(
  available: boolean,
  orderStatus?: string | null
): DriverTrackingMode {
  if (!available) return "offline";
  if (orderStatus && ACTIVE_DELIVERY_STATUSES.includes(orderStatus)) return "active_delivery";
  return "online";
}

export function trackingIntervalMs(mode: DriverTrackingMode): number | null {
  if (mode === "offline") return null;
  const range = mode === "active_delivery"
    ? TRACKING_INTERVAL_MS.active_delivery
    : TRACKING_INTERVAL_MS.online;
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

export type DriverLocationInput = {
  driver_id: string;
  latitude: number;
  longitude: number;
  order_id?: string | null;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  battery_level?: number | null;
  status?: DriverTrackingStatus;
};

export async function findActiveOrderForDriver(
  db: SupabaseClient,
  driverId: string
): Promise<{ order_id: string; status: string } | null> {
  const { data } = await db
    .from("orders")
    .select("order_id,status")
    .eq("driver_id", driverId)
    .in("status", ACTIVE_DELIVERY_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { order_id: String(data.order_id), status: String(data.status) } : null;
}

async function upsertLatestDriverLocation(
  db: SupabaseClient,
  row: {
    driver_id: string;
    order_id: string | null;
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
    accuracy: number | null;
    battery_level: number | null;
    status: DriverTrackingStatus;
  }
) {
  const { error } = await db.from("driver_latest_locations").upsert(
    {
      driver_id: row.driver_id,
      order_id: row.order_id,
      latitude: row.latitude,
      longitude: row.longitude,
      heading: row.heading,
      speed: row.speed,
      accuracy: row.accuracy,
      battery_level: row.battery_level,
      status: row.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "driver_id" }
  );
  if (error) {
    console.warn(JSON.stringify({ driver_latest_location_upsert_failed: error.message }));
  }
}

async function maybeInsertLocationHistory(
  db: SupabaseClient,
  row: {
    driver_id: string;
    order_id: string | null;
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
    accuracy: number | null;
    battery_level: number | null;
    status: DriverTrackingStatus;
  }
) {
  const now = Date.now();
  const last = lastHistoryInsertMs.get(row.driver_id) ?? 0;
  if (now - last < LOCATION_HISTORY_MIN_INTERVAL_MS) return;
  lastHistoryInsertMs.set(row.driver_id, now);

  const { error } = await db.from("driver_locations").insert(row);
  if (error) {
    console.warn(JSON.stringify({ driver_location_history_skipped: error.message }));
  }
}

export async function recordDriverLocation(
  db: SupabaseClient,
  input: DriverLocationInput,
  runtime?: RealtimeRuntime
): Promise<{ id?: number; status: DriverTrackingStatus; order_id: string | null }> {
  const stream = getGpsStreamState(input.driver_id);
  const heading = input.heading ?? stream?.heading_deg ?? null;
  const speedMps = input.speed ?? stream?.speed_mps ?? null;
  const status: DriverTrackingStatus =
    input.status ??
    (input.order_id ? "active_delivery" : "online");

  const row = {
    driver_id: input.driver_id,
    order_id: input.order_id ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    heading,
    speed: speedMps,
    accuracy: input.accuracy ?? null,
    battery_level: input.battery_level ?? null,
    status,
  };

  await upsertLatestDriverLocation(db, row);

  if (input.order_id && status === "active_delivery") {
    await maybeInsertLocationHistory(db, row);
  }

  if (input.order_id && status === "active_delivery") {
    await pushDeliveryEvent(
      input.order_id,
      "driver_location_updated",
      {
        driver_id: input.driver_id,
        latitude: input.latitude,
        longitude: input.longitude,
        heading,
        speed: speedMps,
        accuracy: input.accuracy ?? null,
        battery_level: input.battery_level ?? null,
        status,
      },
      runtime
    );
  }

  return { status, order_id: input.order_id ?? null };
}

export async function getLatestDriverLocation(
  db: SupabaseClient,
  opts: { driverId?: string; orderId?: string }
) {
  if (opts.orderId) {
    const { data: byOrder } = await db
      .from("driver_latest_locations")
      .select("*")
      .eq("order_id", opts.orderId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byOrder) return byOrder;
  }

  if (opts.driverId) {
    const { data: latest } = await db
      .from("driver_latest_locations")
      .select("*")
      .eq("driver_id", opts.driverId)
      .maybeSingle();
    if (latest) return latest;
  }

  let query = db
    .from("driver_locations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (opts.orderId) query = query.eq("order_id", opts.orderId);
  else if (opts.driverId) query = query.eq("driver_id", opts.driverId);
  else return null;

  const { data } = await query.maybeSingle();
  return data;
}

export async function broadcastDriverArrived(
  orderId: string,
  driverId: string,
  runtime?: RealtimeRuntime
) {
  await pushDeliveryEvent(orderId, "driver_arrived", { driver_id: driverId, status: "active_delivery" }, runtime);
}

export async function broadcastDeliveryCompleted(
  orderId: string,
  driverId: string,
  runtime?: RealtimeRuntime
) {
  await pushDeliveryEvent(orderId, "delivery_completed", { driver_id: driverId, status: "online" }, runtime);
}
