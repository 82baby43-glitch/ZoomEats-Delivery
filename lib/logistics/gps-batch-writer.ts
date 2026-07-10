import type { SupabaseClient } from "@supabase/supabase-js";

export type GpsSampleInsert = {
  driver_id: string;
  order_id: string | null;
  lat: number;
  lng: number;
  heading_deg: number | null;
  speed_mps: number | null;
};

const buffers = new Map<string, GpsSampleInsert[]>();
const lastFlushMs = new Map<string, number>();

/** Coalesce frequent GPS pings into fewer multi-row inserts. */
export const GPS_BATCH_MAX = 6;
export const GPS_BATCH_MIN_FLUSH_MS = 12_000;

export function queueGpsSample(sample: GpsSampleInsert): boolean {
  const key = sample.driver_id;
  const batch = buffers.get(key) || [];
  batch.push(sample);
  buffers.set(key, batch);

  const last = lastFlushMs.get(key) ?? 0;
  const elapsed = Date.now() - last;
  return batch.length >= GPS_BATCH_MAX || (batch.length > 0 && elapsed >= GPS_BATCH_MIN_FLUSH_MS);
}

export async function flushGpsBatch(
  db: SupabaseClient,
  driverId: string
): Promise<number> {
  const batch = buffers.get(driverId);
  if (!batch?.length) return 0;

  buffers.set(driverId, []);
  lastFlushMs.set(driverId, Date.now());

  try {
    const { error } = await db.from("driver_gps_samples").insert(
      batch.map((row) => ({
        driver_id: row.driver_id,
        order_id: row.order_id,
        lat: row.lat,
        lng: row.lng,
        heading_deg: row.heading_deg,
        speed_mps: row.speed_mps,
      }))
    );
    if (error) {
      console.warn(JSON.stringify({ gps_batch_flush_skipped: error.message, driver_id: driverId }));
      return 0;
    }
    return batch.length;
  } catch (e) {
    console.warn(JSON.stringify({ gps_batch_flush_skipped: String(e), driver_id: driverId }));
    return 0;
  }
}

export async function flushAllPendingGpsBatches(db: SupabaseClient): Promise<number> {
  let total = 0;
  for (const driverId of [...buffers.keys()]) {
    total += await flushGpsBatch(db, driverId);
  }
  return total;
}
