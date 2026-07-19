import type { SupabaseClient } from "@supabase/supabase-js";
import { getTimeOfDayMultiplier } from "../dispatch/routing/traffic-ai";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function getSurgeRule(db: SupabaseClient, ruleType: string, fallback: number) {
  const { data } = await db
    .from("pricing_rules")
    .select("value")
    .eq("rule_type", ruleType)
    .eq("active", true)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.value != null ? Number(data.value) : fallback;
}

/** Peak hours: lunch 11-14, dinner 17-21 */
export function isPeakHour(date = new Date()): boolean {
  const h = date.getHours();
  return (h >= 11 && h < 14) || (h >= 17 && h < 21);
}

/**
 * Dynamic surge from driver availability + time-of-day traffic.
 * Tunable via pricing_rules — no code deploy required.
 */
export async function computeSurgeMultiplier(
  db: SupabaseClient,
  date = new Date()
): Promise<{ multiplier: number; peakActive: boolean; availableDrivers: number }> {
  const [peakFloor, maxMult, demandCap, trafficFloor, { count: onlineDrivers }, { count: pendingOrders }] =
    await Promise.all([
      getSurgeRule(db, "surge_multiplier_peak", 1.15),
      getSurgeRule(db, "surge_multiplier_max", 2.0),
      getSurgeRule(db, "surge_demand_cap", 0.5),
      getSurgeRule(db, "surge_traffic_floor", 1.1),
      db.from("drivers").select("driver_id", { count: "exact", head: true }).eq("status", "online"),
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
    demandRatio = 1 + demandCap;
  } else if (available > 0) {
    demandRatio = 1 + Math.min(demandCap, pending / available / 4);
  }

  let multiplier = 1;
  if (demandRatio > 1.1) multiplier = round2(Math.min(maxMult, demandRatio));
  if (peakActive && multiplier < peakFloor) multiplier = peakFloor;
  if (trafficMul > 1.3 && multiplier < trafficFloor) multiplier = trafficFloor;

  return { multiplier: round2(Math.min(maxMult, multiplier)), peakActive, availableDrivers: available };
}
