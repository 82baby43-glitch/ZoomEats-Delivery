import type { SupabaseClient } from "@supabase/supabase-js";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((s, r) => s + Number(r[key] || 0), 0);
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function combinedDeliveryFee(row: Record<string, unknown>) {
  return (
    Number(row.delivery_fee ?? 0) +
    Number(row.distance_fee ?? 0) +
    Number(row.surge_fee ?? 0) +
    Number(row.weather_fee ?? 0) +
    Number(row.small_order_fee ?? 0)
  );
}

export type DailyTrendPoint = {
  date: string;
  amount: number;
  count: number;
};

export type DeliveryFeeTrendPoint = {
  date: string;
  total: number;
  average: number;
  count: number;
};

export type FinancialAnalytics = {
  period_days: number;
  summary: {
    revenue: number;
    gmv: number;
    platform_profit: number;
    avg_driver_payout: number;
    avg_restaurant_payout: number;
    commission_revenue: number;
    refunds: number;
    promotion_costs: number;
    delivery_fee_average: number;
    order_count: number;
  };
  trends: {
    revenue: DailyTrendPoint[];
    gmv: DailyTrendPoint[];
    platform_profit: DailyTrendPoint[];
    delivery_fees: DeliveryFeeTrendPoint[];
    commission_revenue: DailyTrendPoint[];
    promotion_costs: DailyTrendPoint[];
    refunds: DailyTrendPoint[];
  };
};

function bucketByDay<T extends { created_at: string }>(
  rows: T[],
  valueFn: (row: T) => number
): DailyTrendPoint[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    const key = dayKey(String(row.created_at));
    const cur = map.get(key) || { amount: 0, count: 0 };
    cur.amount += valueFn(row);
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, amount: round2(v.amount), count: v.count }));
}

export async function getFinancialAnalytics(
  db: SupabaseClient,
  days = 30
): Promise<FinancialAnalytics> {
  const periodDays = Math.min(90, Math.max(7, days));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - periodDays);
  const sinceIso = since.toISOString();

  const [
    { data: platformRows },
    { data: snapshots },
    { data: driverRows },
    { data: settlementRows },
    { data: paidOrders },
  ] = await Promise.all([
    db
      .from("platform_revenue")
      .select("*")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(2000),
    db
      .from("pricing_snapshots")
      .select("subtotal,delivery_fee,distance_fee,surge_fee,weather_fee,small_order_fee,discount_amount,created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(2000),
    db
      .from("driver_earnings")
      .select("final_driver_pay,created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(2000),
    db
      .from("restaurant_settlements")
      .select("net_payout,commission_amount,gross_sales,refund_adjustment,created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(2000),
    db
      .from("orders")
      .select("subtotal,total,payment_status,created_at")
      .eq("payment_status", "paid")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const platform = platformRows || [];
  const snaps = snapshots || [];
  const drivers = driverRows || [];
  const settlements = settlementRows || [];
  const orders = paidOrders || [];

  const deliveryRevenue = sum(platform, "delivery_revenue");
  const serviceRevenue = sum(platform, "service_fee_revenue");
  const commissionRevenue = sum(platform, "commission_revenue");
  const platformProfit = sum(platform, "net_profit");
  const refundCost = sum(platform, "refund_cost");
  const settlementRefunds = sum(settlements, "refund_adjustment");
  const promotionCosts = sum(platform, "promotion_cost");
  const snapshotPromo = sum(snaps, "discount_amount");
  const totalRefunds = round2(refundCost + settlementRefunds);
  const totalPromotion = round2(Math.max(promotionCosts, snapshotPromo));

  const revenue = round2(deliveryRevenue + serviceRevenue + commissionRevenue);
  const gmvFromSnapshots = sum(snaps, "subtotal");
  const gmvFromOrders = sum(orders, "subtotal");
  const gmv = round2(gmvFromSnapshots || gmvFromOrders);

  const driverTotal = sum(drivers, "final_driver_pay");
  const restaurantTotal = sum(settlements, "net_payout");
  const deliveryFeeTotal = snaps.reduce((s, r) => s + combinedDeliveryFee(r), 0);

  const orderCount = Math.max(platform.length, snaps.length, orders.length);
  const avgDriver = drivers.length ? round2(driverTotal / drivers.length) : 0;
  const avgRestaurant = settlements.length ? round2(restaurantTotal / settlements.length) : 0;
  const avgDeliveryFee = snaps.length ? round2(deliveryFeeTotal / snaps.length) : 0;

  const platformByDay = (valueFn: (row: Record<string, unknown>) => number) =>
    bucketByDay(platform, valueFn);

  const deliveryTrendMap = new Map<string, { total: number; count: number }>();
  for (const row of snaps) {
    const key = dayKey(String(row.created_at));
    const fee = combinedDeliveryFee(row);
    const cur = deliveryTrendMap.get(key) || { total: 0, count: 0 };
    cur.total += fee;
    cur.count += 1;
    deliveryTrendMap.set(key, cur);
  }
  const deliveryFees: DeliveryFeeTrendPoint[] = [...deliveryTrendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      total: round2(v.total),
      average: round2(v.count ? v.total / v.count : 0),
      count: v.count,
    }));

  return {
    period_days: periodDays,
    summary: {
      revenue,
      gmv,
      platform_profit: round2(platformProfit),
      avg_driver_payout: avgDriver,
      avg_restaurant_payout: avgRestaurant,
      commission_revenue: round2(commissionRevenue),
      refunds: totalRefunds,
      promotion_costs: totalPromotion,
      delivery_fee_average: avgDeliveryFee,
      order_count: orderCount,
    },
    trends: {
      revenue: platformByDay(
        (r) =>
          Number(r.delivery_revenue ?? 0) +
          Number(r.service_fee_revenue ?? 0) +
          Number(r.commission_revenue ?? 0)
      ),
      gmv: snaps.length
        ? bucketByDay(snaps, (r) => Number(r.subtotal ?? 0))
        : bucketByDay(orders, (r) => Number(r.subtotal ?? 0)),
      platform_profit: platformByDay((r) => Number(r.net_profit ?? 0)),
      delivery_fees: deliveryFees,
      commission_revenue: platformByDay((r) => Number(r.commission_revenue ?? 0)),
      promotion_costs: platform.length
        ? bucketByDay(platform, (r) => Number(r.promotion_cost ?? 0))
        : bucketByDay(snaps, (r) => Number(r.discount_amount ?? 0)),
      refunds: platformByDay((r) => Number(r.refund_cost ?? 0)),
    },
  };
}
