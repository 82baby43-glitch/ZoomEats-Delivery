import type { SupabaseClient } from "@supabase/supabase-js";
import { milesBetween, estimateDriveMinutes } from "../pricing/geo";
import { isPeakHour } from "../pricing/surge";
import { getTimeOfDayMultiplier } from "../dispatch/routing/traffic-ai";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface DriverEarningsInput {
  distanceMiles: number;
  durationMinutes?: number;
  waitMinutes?: number;
  tipAmount?: number;
  orderSubtotal?: number;
  weatherActive?: boolean;
  peakActive?: boolean;
  bonusPay?: number;
}

export interface DriverEarningsBreakdown {
  base_pay: number;
  mileage_pay: number;
  time_pay: number;
  wait_pay: number;
  peak_bonus: number;
  long_distance_bonus: number;
  large_order_bonus: number;
  weather_bonus: number;
  bonus_pay: number;
  customer_tip: number;
  guaranteed_pay: number;
  guaranteed_top_up: number;
  pre_tip_pay: number;
  final_driver_pay: number;
  distance_miles: number;
  peak_active: boolean;
}

export interface DriverEarningsSummary {
  today: number;
  week: number;
  tips: number;
  bonuses: number;
  mileage: number;
  deliveries_completed: number;
  acceptance_rate: number;
  completion_rate: number;
  online_minutes: number;
  effective_hourly: number;
  recent: Array<{
    order_id: string;
    final_driver_pay: number;
    customer_tip: number;
    created_at: string;
    status: string;
  }>;
}

async function rpcDriverPay(db: SupabaseClient, input: DriverEarningsInput): Promise<DriverEarningsBreakdown | null> {
  const { data, error } = await db.rpc("calculate_driver_pay", {
    p_distance_miles: input.distanceMiles,
    p_duration_minutes: input.durationMinutes ?? estimateDriveMinutes(input.distanceMiles),
    p_wait_minutes: input.waitMinutes ?? 5,
    p_tip_amount: input.tipAmount ?? 0,
    p_order_subtotal: input.orderSubtotal ?? 0,
    p_weather_active: Boolean(input.weatherActive),
    p_peak_active: Boolean(input.peakActive ?? isPeakHour()),
    p_bonus_pay: input.bonusPay ?? 0,
  });
  if (error || !data) return null;
  const row = data as Record<string, number | boolean>;
  return {
    base_pay: Number(row.base_pay ?? 0),
    mileage_pay: Number(row.mileage_pay ?? 0),
    time_pay: Number(row.time_pay ?? 0),
    wait_pay: Number(row.wait_pay ?? 0),
    peak_bonus: Number(row.peak_bonus ?? 0),
    long_distance_bonus: Number(row.long_distance_bonus ?? 0),
    large_order_bonus: Number(row.large_order_bonus ?? 0),
    weather_bonus: Number(row.weather_bonus ?? 0),
    bonus_pay: Number(row.bonus_pay ?? 0),
    customer_tip: Number(row.customer_tip ?? 0),
    guaranteed_pay: Number(row.guaranteed_pay ?? 0),
    guaranteed_top_up: Number(row.guaranteed_top_up ?? 0),
    pre_tip_pay: Number(row.pre_tip_pay ?? 0),
    final_driver_pay: Number(row.final_driver_pay ?? 0),
    distance_miles: Number(row.distance_miles ?? input.distanceMiles),
    peak_active: Boolean(row.peak_active),
  };
}

/** Central driver earnings calculation — single source of truth. */
export async function calculateDriverEarnings(
  db: SupabaseClient,
  input: DriverEarningsInput
): Promise<DriverEarningsBreakdown> {
  const result = await rpcDriverPay(db, input);
  if (!result) {
    throw new Error("Driver earnings calculation failed");
  }
  return result;
}

export async function estimateDriverEarningsForOrder(
  db: SupabaseClient,
  order: Record<string, unknown>,
  restaurant?: { latitude?: number | null; longitude?: number | null } | null
): Promise<DriverEarningsBreakdown> {
  let distanceMiles = 3;
  const cLat = Number(order.customer_lat);
  const cLng = Number(order.customer_lng);
  const rLat = Number(restaurant?.latitude ?? order.restaurant_lat ?? 0);
  const rLng = Number(restaurant?.longitude ?? order.restaurant_lng ?? 0);
  if (cLat && cLng && rLat && rLng) {
    distanceMiles = milesBetween({ lat: cLat, lng: cLng }, { lat: rLat, lng: rLng });
  }

  const trafficMul = getTimeOfDayMultiplier();
  const tip = Number(order.tip_amount ?? order.tip ?? 0);
  const subtotal = Number(order.subtotal ?? 0);

  return calculateDriverEarnings(db, {
    distanceMiles: round2(distanceMiles),
    durationMinutes: estimateDriveMinutes(distanceMiles, trafficMul),
    waitMinutes: 5,
    tipAmount: tip,
    orderSubtotal: subtotal,
    peakActive: isPeakHour(),
  });
}

export async function resolveDriverId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data: driver } = await db.from("drivers").select("driver_id").eq("user_id", userId).maybeSingle();
  return driver?.driver_id ? String(driver.driver_id) : null;
}

export async function getDriverEarningsSummary(
  db: SupabaseClient,
  userId: string
): Promise<DriverEarningsSummary> {
  const driverId = await resolveDriverId(db, userId);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  let earningsQuery = db
    .from("driver_earnings")
    .select("order_id,final_driver_pay,customer_tip,base_pay,mileage_pay,peak_bonus,long_distance_bonus,large_order_bonus,weather_bonus,bonus_pay,created_at,status")
    .order("created_at", { ascending: false })
    .limit(100);

  if (driverId) {
    earningsQuery = earningsQuery.eq("driver_id", driverId);
  }

  const { data: rows } = await earningsQuery;
  const ledger = rows || [];

  const todayRows = ledger.filter((r) => new Date(String(r.created_at)) >= todayStart);
  const weekRows = ledger.filter((r) => new Date(String(r.created_at)) >= weekStart);

  const sumPay = (list: typeof ledger) => list.reduce((s, r) => s + Number(r.final_driver_pay || 0), 0);
  const sumTips = (list: typeof ledger) => list.reduce((s, r) => s + Number(r.customer_tip || 0), 0);
  const sumBonuses = (list: typeof ledger) =>
    list.reduce(
      (s, r) =>
        s +
        Number(r.peak_bonus || 0) +
        Number(r.long_distance_bonus || 0) +
        Number(r.large_order_bonus || 0) +
        Number(r.weather_bonus || 0) +
        Number(r.bonus_pay || 0),
      0
    );
  const sumMiles = (list: typeof ledger) => list.reduce((s, r) => s + Number(r.mileage_pay || 0) / 0.75, 0);

  const todayTotal = round2(sumPay(todayRows));
  const onlineMinutes = todayRows.length ? Math.max(60, todayRows.length * 35) : 0;

  return {
    today: todayTotal,
    week: round2(sumPay(weekRows)),
    tips: round2(sumTips(weekRows)),
    bonuses: round2(sumBonuses(weekRows)),
    mileage: round2(sumMiles(weekRows)),
    deliveries_completed: todayRows.length,
    acceptance_rate: 94,
    completion_rate: 98,
    online_minutes: onlineMinutes,
    effective_hourly: onlineMinutes > 0 ? round2((todayTotal / onlineMinutes) * 60) : 0,
    recent: ledger.slice(0, 10).map((r) => ({
      order_id: String(r.order_id),
      final_driver_pay: Number(r.final_driver_pay || 0),
      customer_tip: Number(r.customer_tip || 0),
      created_at: String(r.created_at),
      status: String(r.status || "calculated"),
    })),
  };
}

export async function getDriverOrderEarningsBreakdown(
  db: SupabaseClient,
  userId: string,
  orderId: string
): Promise<{ breakdown: DriverEarningsBreakdown; source: "ledger" | "estimate" } | null> {
  const driverId = await resolveDriverId(db, userId);

  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!order) return null;

  const assigned =
    order.delivery_partner_id === userId || (driverId && order.driver_id === driverId);
  if (!assigned) return null;

  const { data: ledger } = await db
    .from("driver_earnings")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (ledger) {
    return {
      source: "ledger",
      breakdown: {
        base_pay: Number(ledger.base_pay ?? 0),
        mileage_pay: Number(ledger.mileage_pay ?? 0),
        time_pay: Number(ledger.time_pay ?? 0),
        wait_pay: Number(ledger.wait_pay ?? 0),
        peak_bonus: Number(ledger.peak_bonus ?? 0),
        long_distance_bonus: Number(ledger.long_distance_bonus ?? 0),
        large_order_bonus: Number(ledger.large_order_bonus ?? 0),
        weather_bonus: Number(ledger.weather_bonus ?? 0),
        bonus_pay: Number(ledger.bonus_pay ?? 0),
        customer_tip: Number(ledger.customer_tip ?? 0),
        guaranteed_pay: Number(ledger.guaranteed_pay ?? 0),
        guaranteed_top_up: Number(ledger.guaranteed_top_up ?? 0),
        pre_tip_pay: Number(ledger.pre_tip_pay ?? 0),
        final_driver_pay: Number(ledger.final_driver_pay ?? 0),
        distance_miles: Number(order.route_distance ?? 0) || 3,
        peak_active: Number(ledger.peak_bonus ?? 0) > 0,
      },
    };
  }

  const { data: rest } = order.restaurant_id
    ? await db.from("restaurants").select("latitude,longitude").eq("restaurant_id", order.restaurant_id).maybeSingle()
    : { data: null };

  const { data: snapshot } = await db
    .from("pricing_snapshots")
    .select("rule_snapshot")
    .eq("order_id", orderId)
    .maybeSingle();

  const snapDriver = (snapshot?.rule_snapshot as { driver?: DriverEarningsBreakdown })?.driver;
  if (snapDriver?.final_driver_pay) {
    return { source: "estimate", breakdown: snapDriver };
  }

  const estimate = await estimateDriverEarningsForOrder(db, order, rest);
  return { source: "estimate", breakdown: estimate };
}

/** Display-friendly line items for driver UI */
export function formatDriverEarningsLines(breakdown: DriverEarningsBreakdown) {
  const lines: Array<{ label: string; amount: number; highlight?: boolean }> = [];
  if (breakdown.base_pay > 0) lines.push({ label: "Base pay", amount: breakdown.base_pay });
  if (breakdown.mileage_pay > 0) lines.push({ label: "Per-mile pay", amount: breakdown.mileage_pay });
  if (breakdown.time_pay > 0) lines.push({ label: "Per-minute pay", amount: breakdown.time_pay });
  if (breakdown.wait_pay > 0) lines.push({ label: "Wait time", amount: breakdown.wait_pay });
  if (breakdown.peak_bonus > 0) lines.push({ label: "Peak pay", amount: breakdown.peak_bonus, highlight: true });
  if (breakdown.long_distance_bonus > 0) {
    lines.push({ label: "Long-distance bonus", amount: breakdown.long_distance_bonus, highlight: true });
  }
  if (breakdown.large_order_bonus > 0) lines.push({ label: "Large order bonus", amount: breakdown.large_order_bonus });
  if (breakdown.weather_bonus > 0) lines.push({ label: "Weather bonus", amount: breakdown.weather_bonus });
  if (breakdown.bonus_pay > 0) lines.push({ label: "Bonus", amount: breakdown.bonus_pay });
  if (breakdown.guaranteed_top_up > 0) {
    lines.push({ label: "Guaranteed minimum top-up", amount: breakdown.guaranteed_top_up, highlight: true });
  }
  if (breakdown.customer_tip > 0) {
    lines.push({ label: "Customer tip (100%)", amount: breakdown.customer_tip, highlight: true });
  }
  return lines;
}
