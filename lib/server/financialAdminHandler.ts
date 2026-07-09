import type { SupabaseClient } from "@supabase/supabase-js";

type AdminCtx = {
  path: string;
  method: string;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((s, r) => s + Number(r[key] || 0), 0);
}

export async function handleFinancialAdminRequest(
  db: SupabaseClient,
  ctx: AdminCtx
): Promise<unknown | null> {
  const { path, method } = ctx;

  if (path !== "/admin/revenue" || method !== "GET") {
    return null;
  }

  ctx.requireRole("admin");

  const [
    { data: driverEarnings },
    { data: settlements },
    { data: platformRows },
    { data: paidOrders },
  ] = await Promise.all([
    db.from("driver_earnings").select("final_driver_pay,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("restaurant_settlements").select("net_payout,commission_amount,gross_sales,status,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("platform_revenue").select("net_profit,commission_revenue,delivery_revenue,service_fee_revenue,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("orders").select("total").eq("payment_status", "paid"),
  ]);

  const driverTotal = sum(driverEarnings || [], "final_driver_pay");
  const restaurantTotal = sum(settlements || [], "net_payout");
  const commissionTotal = sum(settlements || [], "commission_amount");
  const platformTotal = sum(platformRows || [], "net_profit");
  const grossRevenue = sum(platformRows || [], "delivery_revenue") + sum(platformRows || [], "service_fee_revenue") + commissionTotal;
  const orderCount = (paidOrders || []).length;
  const orderTotal = sum(paidOrders || [], "total");
  const avgOrderValue = orderCount ? round2(orderTotal / orderCount) : 0;
  const avgDriverPay = (driverEarnings || []).length ? round2(driverTotal / (driverEarnings || []).length) : 0;
  const avgMargin = grossRevenue > 0 ? round2((platformTotal / grossRevenue) * 100) : 0;

  return {
    total_revenue: round2(grossRevenue),
    driver_earnings: round2(driverTotal),
    restaurant_payments: round2(restaurantTotal),
    platform_commission: round2(commissionTotal),
    platform_net_profit: round2(platformTotal),
    average_order_value: avgOrderValue,
    average_driver_pay: avgDriverPay,
    average_margin_pct: avgMargin,
    ledger_counts: {
      driver_earnings: (driverEarnings || []).length,
      restaurant_settlements: (settlements || []).length,
      platform_revenue: (platformRows || []).length,
      paid_orders: orderCount,
    },
    recent_driver_earnings: (driverEarnings || []).slice(0, 10),
    recent_settlements: (settlements || []).slice(0, 10),
    recent_platform_revenue: (platformRows || []).slice(0, 10),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
