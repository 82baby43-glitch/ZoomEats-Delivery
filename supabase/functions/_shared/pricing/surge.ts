import type { SupabaseClient } from "@supabase/supabase-js";
import { getTimeOfDayMultiplier } from "../routing/traffic-ai.ts";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Peak hours: lunch 11-14, dinner 17-21 */
export function isPeakHour(date = new Date()): boolean {
  const h = date.getHours();
  return (h >= 11 && h < 14) || (h >= 17 && h < 21);
}

/**
 * Dynamic surge from driver availability + time-of-day traffic.
 * Returns multiplier >= 1.0
 */
export async function computeSurgeMultiplier(
  db: SupabaseClient,
  date = new Date()
): Promise<{ multiplier: number; peakActive: boolean; availableDrivers: number }> {
  const [{ count: onlineDrivers }, { count: pendingOrders }] = await Promise.all([
    db
      .from("drivers")
      .select("driver_id", { count: "exact", head: true })
      .eq("status", "online"),
    db
      .from("orders")
      .select("order_id", { count: "exact", head: true })
      .in("status", ["placed", "accepted", "preparing", "ready", "assigned_internal"]),
  ]);

  const available = onlineDrivers ?? 0;
  const pending = pendingOrders ?? 0;
  const peakActive = isPeakHour(date);
  const trafficMul = getTimeOfDayMultiplier(date);

  let demandRatio = 1;
  if (available === 0 && pending > 0) {
    demandRatio = 1.5;
  } else if (available > 0) {
    demandRatio = 1 + Math.min(0.5, pending / available / 4);
  }

  let multiplier = 1;
  if (demandRatio > 1.1) multiplier = round2(Math.min(2.0, demandRatio));
  if (peakActive && multiplier < 1.15) multiplier = 1.15;
  if (trafficMul > 1.3 && multiplier < 1.1) multiplier = 1.1;

  return { multiplier: round2(multiplier), peakActive, availableDrivers: available };
}
