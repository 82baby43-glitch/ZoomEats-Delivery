/**
 * Persist immutable financial ledgers for a completed / priced order.
 * Never overwrites existing snapshot rows (unique on order_id).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderPricingResult } from "./types";

export type PersistPricingContext = {
  orderId: string;
  customerId?: string | null;
  restaurantId?: string | null;
  driverId?: string | null;
  pricing: OrderPricingResult;
  changedBy?: string;
  reason?: string;
};

async function insertIgnoreConflict(
  db: SupabaseClient,
  table: string,
  row: Record<string, unknown>
): Promise<{ inserted: boolean; error?: string }> {
  const { error } = await db.from(table).insert(row);
  if (!error) return { inserted: true };
  // Unique violation — already persisted (immutable)
  if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
    return { inserted: false };
  }
  return { inserted: false, error: error.message };
}

export async function persistOrderFinancials(
  db: SupabaseClient,
  ctx: PersistPricingContext
): Promise<{ ok: boolean; errors: string[] }> {
  const p = ctx.pricing;
  const errors: string[] = [];

  const snap = await insertIgnoreConflict(db, "pricing_snapshots", {
    order_id: ctx.orderId,
    customer_id: ctx.customerId || null,
    restaurant_id: ctx.restaurantId || null,
    driver_id: ctx.driverId || null,
    subtotal: p.subtotal,
    tax_amount: p.tax,
    delivery_fee: p.deliveryFee,
    service_fee: p.serviceFee,
    small_order_fee: p.smallOrderFee,
    distance_fee: p.distanceFee,
    surge_fee: p.surgeFee,
    weather_fee: p.weatherFee,
    discount_amount: p.discounts,
    tip_amount: p.customerTip,
    customer_total: p.customerTotal,
    rule_snapshot: {
      meta: p.meta,
      driver: {
        baseDriverPay: p.baseDriverPay,
        mileagePay: p.mileagePay,
        timePay: p.timePay,
        waitPay: p.waitPay,
        trafficPay: p.trafficPay,
        bonuses: p.bonuses,
        finalDriverPay: p.finalDriverPay,
      },
      restaurant: {
        commission: p.restaurantCommission,
        payout: p.restaurantPayout,
      },
      platform: {
        revenue: p.platformRevenue,
        stripeFees: p.stripeFees,
        netProfit: p.netProfit,
      },
    },
  });
  if (snap.error) errors.push(`pricing_snapshots: ${snap.error}`);

  if (ctx.driverId) {
    const earn = await insertIgnoreConflict(db, "driver_earnings", {
      order_id: ctx.orderId,
      driver_id: ctx.driverId,
      base_pay: p.baseDriverPay,
      mileage_pay: p.mileagePay,
      time_pay: p.timePay,
      wait_pay: p.waitPay + p.trafficPay,
      bonus_pay: p.bonuses,
      weather_bonus: p.weatherBonus,
      peak_bonus: p.peakBonus,
      large_order_bonus: p.largeOrderBonus,
      customer_tip: p.customerTip,
      guaranteed_pay: p.driverGuaranteedPay,
      final_driver_pay: p.finalDriverPay,
    });
    if (earn.error) errors.push(`driver_earnings: ${earn.error}`);
  }

  if (ctx.restaurantId) {
    const settle = await insertIgnoreConflict(db, "restaurant_settlements", {
      order_id: ctx.orderId,
      restaurant_id: ctx.restaurantId,
      gross_sales: p.subtotal,
      commission_amount: p.restaurantCommission,
      promotion_adjustment: 0,
      refund_adjustment: 0,
      chargeback_adjustment: 0,
      stripe_fee: 0,
      net_payout: p.restaurantPayout,
      status: "pending",
    });
    if (settle.error) errors.push(`restaurant_settlements: ${settle.error}`);
  }

  const rev = await insertIgnoreConflict(db, "platform_revenue", {
    order_id: ctx.orderId,
    delivery_revenue: p.deliveryFee + p.distanceFee + p.surgeFee + p.weatherFee,
    service_fee_revenue: p.serviceFee + p.smallOrderFee,
    commission_revenue: p.restaurantCommission,
    advertising_revenue: 0,
    subscription_revenue: 0,
    driver_cost: Math.max(p.finalDriverPay - p.customerTip, 0),
    restaurant_cost: Math.max(p.restaurantPayout, 0),
    stripe_cost: p.stripeFees,
    refund_cost: 0,
    promotion_cost: p.discounts,
    net_profit: p.netProfit,
  });
  if (rev.error) errors.push(`platform_revenue: ${rev.error}`);

  await db.from("pricing_audit_logs").insert({
    order_id: ctx.orderId,
    action: snap.inserted ? "pricing_persisted" : "pricing_persist_skipped_existing",
    previous_value: null,
    new_value: {
      customerTotal: p.customerTotal,
      finalDriverPay: p.finalDriverPay,
      restaurantPayout: p.restaurantPayout,
      netProfit: p.netProfit,
    },
    changed_by: ctx.changedBy || "system",
    reason: ctx.reason || "order_financials",
  });

  return { ok: errors.length === 0, errors };
}

export async function logPricingAudit(
  db: SupabaseClient,
  opts: {
    orderId?: string | null;
    action: string;
    previousValue?: unknown;
    newValue?: unknown;
    changedBy?: string;
    reason?: string;
  }
) {
  await db.from("pricing_audit_logs").insert({
    order_id: opts.orderId || null,
    action: opts.action,
    previous_value: opts.previousValue ?? null,
    new_value: opts.newValue ?? null,
    changed_by: opts.changedBy || "system",
    reason: opts.reason || null,
  });
}
