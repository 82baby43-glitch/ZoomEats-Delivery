import type { SupabaseClient } from "@supabase/supabase-js";

export interface FinancialRecordResult {
  ok: boolean;
  skipped?: boolean;
  order_id: string;
  driver_earnings_id?: string;
  restaurant_settlement_id?: string;
  platform_revenue_id?: string;
  error?: string;
}

function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.max(0.5, 2 * 3958.8 * Math.asin(Math.sqrt(h)));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function rpcJson(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) return null;
  return data as Record<string, number | string>;
}

/** Idempotent financial ledger write when an order is delivered. */
export async function recordOrderFinancials(
  db: SupabaseClient,
  orderId: string
): Promise<FinancialRecordResult> {
  const [{ data: existingDriver }, { data: order }] = await Promise.all([
    db.from("driver_earnings").select("id").eq("order_id", orderId).maybeSingle(),
    db.from("orders").select("*").eq("order_id", orderId).maybeSingle(),
  ]);

  if (existingDriver?.id) {
    return { ok: true, skipped: true, order_id: orderId };
  }

  if (!order) {
    return { ok: false, order_id: orderId, error: "Order not found" };
  }

  if (order.status !== "delivered") {
    return { ok: false, order_id: orderId, error: `Order status is ${order.status}, not delivered` };
  }

  if (order.payment_status !== "paid") {
    return { ok: false, order_id: orderId, error: `Payment status is ${order.payment_status}` };
  }

  const subtotal = Number(order.subtotal ?? 0);
  const deliveryFee = Number(order.delivery_fee ?? 0);
  const total = Number(order.total ?? subtotal + deliveryFee);
  const tip = Number(order.tip ?? order.tip_amount ?? 0);
  const serviceFee = Math.max(0, round2(total - subtotal - deliveryFee - tip));

  let distanceMiles = 3;
  if (order.customer_lat && order.customer_lng && order.restaurant_id) {
    const { data: rest } = await db
      .from("restaurants")
      .select("latitude,longitude")
      .eq("restaurant_id", order.restaurant_id)
      .maybeSingle();
    if (rest?.latitude && rest?.longitude) {
      distanceMiles = milesBetween(
        { lat: Number(order.customer_lat), lng: Number(order.customer_lng) },
        { lat: Number(rest.latitude), lng: Number(rest.longitude) }
      );
    }
  }

  const driverId = String(order.driver_id || order.delivery_partner_id || "unassigned");

  const driverCalc =
    (await rpcJson(db, "calculate_driver_pay", {
      p_distance_miles: distanceMiles,
      p_duration_minutes: Math.max(15, distanceMiles * 4),
      p_wait_minutes: 5,
      p_tip_amount: tip,
      p_order_subtotal: subtotal,
      p_weather_active: false,
      p_peak_active: false,
      p_bonus_pay: 0,
    })) || {
      base_pay: 5,
      mileage_pay: round2(distanceMiles * 0.75),
      time_pay: 2,
      wait_pay: 0.75,
      bonus_pay: 0,
      weather_bonus: 0,
      peak_bonus: 0,
      large_order_bonus: 0,
      customer_tip: tip,
      guaranteed_pay: 0,
      final_driver_pay: round2(5 + distanceMiles * 0.75 + 2 + 0.75 + tip),
    };

  const restaurantCalc =
    (await rpcJson(db, "calculate_restaurant_payout", {
      p_gross_sales: subtotal,
      p_promotion_adjustment: 0,
      p_refund_adjustment: 0,
      p_chargeback_adjustment: 0,
      p_include_stripe_fee: false,
    })) || {
      gross_sales: subtotal,
      commission_amount: round2(subtotal * 0.2),
      promotion_adjustment: 0,
      refund_adjustment: 0,
      chargeback_adjustment: 0,
      stripe_fee: 0,
      net_payout: round2(subtotal * 0.8),
      status: "pending",
    };

  const commissionAmount = Number(restaurantCalc.commission_amount ?? round2(subtotal * 0.2));
  const driverCost = Number(driverCalc.final_driver_pay ?? 0);
  const restaurantCost = Number(restaurantCalc.net_payout ?? 0);

  const platformCalc =
    (await rpcJson(db, "calculate_platform_profit", {
      p_delivery_revenue: deliveryFee,
      p_service_fee_revenue: serviceFee,
      p_commission_revenue: commissionAmount,
      p_advertising_revenue: 0,
      p_subscription_revenue: 0,
      p_driver_cost: driverCost,
      p_restaurant_cost: restaurantCost,
      p_stripe_cost: round2(total * 0.029 + 0.3),
      p_refund_cost: 0,
      p_promotion_cost: 0,
    })) || {
      delivery_revenue: deliveryFee,
      service_fee_revenue: serviceFee,
      commission_revenue: commissionAmount,
      advertising_revenue: 0,
      subscription_revenue: 0,
      driver_cost: driverCost,
      restaurant_cost: restaurantCost,
      stripe_cost: round2(total * 0.029 + 0.3),
      refund_cost: 0,
      promotion_cost: 0,
      net_profit: round2(deliveryFee + serviceFee + commissionAmount - driverCost - restaurantCost),
    };

  const { data: driverRow, error: driverErr } = await db
    .from("driver_earnings")
    .insert({
      order_id: orderId,
      driver_id: driverId,
      base_pay: Number(driverCalc.base_pay ?? 0),
      mileage_pay: Number(driverCalc.mileage_pay ?? 0),
      time_pay: Number(driverCalc.time_pay ?? 0),
      wait_pay: Number(driverCalc.wait_pay ?? 0),
      bonus_pay: Number(driverCalc.bonus_pay ?? 0),
      weather_bonus: Number(driverCalc.weather_bonus ?? 0),
      peak_bonus: Number(driverCalc.peak_bonus ?? 0),
      large_order_bonus: Number(driverCalc.large_order_bonus ?? 0),
      customer_tip: Number(driverCalc.customer_tip ?? 0),
      guaranteed_pay: Number(driverCalc.guaranteed_pay ?? 0),
      final_driver_pay: Number(driverCalc.final_driver_pay ?? 0),
      status: "calculated",
    })
    .select("id")
    .single();

  if (driverErr) {
    return { ok: false, order_id: orderId, error: driverErr.message };
  }

  const { data: settlementRow, error: settlementErr } = await db
    .from("restaurant_settlements")
    .insert({
      order_id: orderId,
      restaurant_id: order.restaurant_id,
      gross_sales: Number(restaurantCalc.gross_sales ?? subtotal),
      commission_amount: commissionAmount,
      promotion_adjustment: Number(restaurantCalc.promotion_adjustment ?? 0),
      refund_adjustment: Number(restaurantCalc.refund_adjustment ?? 0),
      chargeback_adjustment: Number(restaurantCalc.chargeback_adjustment ?? 0),
      stripe_fee: Number(restaurantCalc.stripe_fee ?? 0),
      net_payout: Number(restaurantCalc.net_payout ?? 0),
      status: String(restaurantCalc.status ?? "pending"),
    })
    .select("id")
    .single();

  if (settlementErr) {
    await db.from("driver_earnings").delete().eq("order_id", orderId);
    return { ok: false, order_id: orderId, error: settlementErr.message };
  }

  const { data: revenueRow, error: revenueErr } = await db
    .from("platform_revenue")
    .insert({
      order_id: orderId,
      delivery_revenue: Number(platformCalc.delivery_revenue ?? deliveryFee),
      service_fee_revenue: Number(platformCalc.service_fee_revenue ?? serviceFee),
      commission_revenue: Number(platformCalc.commission_revenue ?? commissionAmount),
      advertising_revenue: Number(platformCalc.advertising_revenue ?? 0),
      subscription_revenue: Number(platformCalc.subscription_revenue ?? 0),
      driver_cost: Number(platformCalc.driver_cost ?? driverCost),
      restaurant_cost: Number(platformCalc.restaurant_cost ?? restaurantCost),
      stripe_cost: Number(platformCalc.stripe_cost ?? 0),
      refund_cost: Number(platformCalc.refund_cost ?? 0),
      promotion_cost: Number(platformCalc.promotion_cost ?? 0),
      net_profit: Number(platformCalc.net_profit ?? 0),
    })
    .select("id")
    .single();

  if (revenueErr) {
    await db.from("driver_earnings").delete().eq("order_id", orderId);
    await db.from("restaurant_settlements").delete().eq("order_id", orderId);
    return { ok: false, order_id: orderId, error: revenueErr.message };
  }

  return {
    ok: true,
    order_id: orderId,
    driver_earnings_id: driverRow?.id,
    restaurant_settlement_id: settlementRow?.id,
    platform_revenue_id: revenueRow?.id,
  };
}
