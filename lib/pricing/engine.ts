import type { SupabaseClient } from "@supabase/supabase-js";
import { getTimeOfDayMultiplier } from "../dispatch/routing/traffic-ai";
import { milesBetween, estimateDriveMinutes } from "./geo";
import { computeSurgeMultiplier } from "./surge";
import { capDiscountToPromotionBudget } from "./promotionBudget";
import type { PricingQuote, PricingQuoteInput } from "./types";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function rpcJson(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) return { data: null, error: error.message };
  return { data: data as Record<string, number | string | boolean | null>, error: null };
}

async function getRuleValue(db: SupabaseClient, ruleType: string): Promise<number> {
  const { data } = await db
    .from("pricing_rules")
    .select("value,percentage,minimum_amount,maximum_amount")
    .eq("rule_type", ruleType)
    .eq("active", true)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return 0;
  return Number(data.value ?? 0);
}

async function getPricingVersion(db: SupabaseClient): Promise<string> {
  const v = await getRuleValue(db, "pricing_version");
  return v > 0 ? `v${v}` : "v1";
}

export interface QuoteContext {
  distanceMiles: number;
  driveMinutes: number;
  surgeMultiplier: number;
  peakActive: boolean;
  commissionPercent: number | null;
}

export async function resolveQuoteContext(
  db: SupabaseClient,
  input: PricingQuoteInput
): Promise<QuoteContext> {
  let distanceMiles = 3;
  if (
    input.customerLat != null &&
    input.customerLng != null &&
    input.restaurantLat != null &&
    input.restaurantLng != null
  ) {
    distanceMiles = milesBetween(
      { lat: input.customerLat, lng: input.customerLng },
      { lat: input.restaurantLat, lng: input.restaurantLng }
    );
  }

  const trafficMul = getTimeOfDayMultiplier();
  const driveMinutes = estimateDriveMinutes(distanceMiles, trafficMul);
  const surge = await computeSurgeMultiplier(db);

  let commissionPercent: number | null = null;
  if (input.restaurantId) {
    const { data: rest } = await db
      .from("restaurants")
      .select("commission_rate")
      .eq("restaurant_id", input.restaurantId)
      .maybeSingle();
    if (rest?.commission_rate != null) {
      commissionPercent = Number(rest.commission_rate);
    }
  }

  return {
    distanceMiles: round2(distanceMiles),
    driveMinutes,
    surgeMultiplier: surge.multiplier,
    peakActive: surge.peakActive,
    commissionPercent,
  };
}

/** Full intelligent pricing quote — single source of truth for all surfaces. */
export async function calculatePricingQuote(
  db: SupabaseClient,
  input: PricingQuoteInput
): Promise<PricingQuote> {
  const subtotal = round2(Math.max(0, input.subtotal));
  const tipAmount = round2(Math.max(0, input.tipAmount ?? 0));
  const discountAmount = round2(Math.max(0, input.discountAmount ?? 0));
  const ctx = await resolveQuoteContext(db, input);
  const version = await getPricingVersion(db);

  const [minProfit, subsidyRule] = await Promise.all([
    getRuleValue(db, "min_platform_profit"),
    getRuleValue(db, "subsidy_enabled"),
  ]);
  const subsidyAllowed = Boolean(input.allowSubsidy || subsidyRule > 0);

  const orderPricing = await rpcJson(db, "calculate_order_pricing", {
    p_subtotal: subtotal,
    p_distance_miles: ctx.distanceMiles,
    p_tip_amount: tipAmount,
    p_discount_amount: discountAmount,
    p_surge_multiplier: ctx.surgeMultiplier,
    p_weather_active: Boolean(input.weatherActive),
    p_promo_code: input.promoCode || null,
  });

  if (!orderPricing.data) {
    throw new Error(orderPricing.error || "Pricing calculation failed");
  }

  const customer = {
    subtotal: Number(orderPricing.data.subtotal ?? subtotal),
    tax_amount: Number(orderPricing.data.tax_amount ?? 0),
    delivery_fee: Number(orderPricing.data.delivery_fee ?? 0),
    service_fee: Number(orderPricing.data.service_fee ?? 0),
    small_order_fee: Number(orderPricing.data.small_order_fee ?? 0),
    distance_fee: Number(orderPricing.data.distance_fee ?? 0),
    surge_fee: Number(orderPricing.data.surge_fee ?? 0),
    weather_fee: Number(orderPricing.data.weather_fee ?? 0),
    discount_amount: Number(orderPricing.data.discount_amount ?? 0),
    tip_amount: Number(orderPricing.data.tip_amount ?? tipAmount),
    customer_total: Number(orderPricing.data.customer_total ?? 0),
  };

  const rawDiscount = customer.discount_amount;
  const cappedDiscount = await capDiscountToPromotionBudget(db, rawDiscount);
  if (cappedDiscount !== rawDiscount) {
    customer.discount_amount = cappedDiscount;
    customer.customer_total = round2(customer.customer_total + (rawDiscount - cappedDiscount));
  }

  const driverCalc = await rpcJson(db, "calculate_driver_pay", {
    p_distance_miles: ctx.distanceMiles,
    p_duration_minutes: ctx.driveMinutes,
    p_wait_minutes: 5,
    p_tip_amount: tipAmount,
    p_order_subtotal: subtotal,
    p_weather_active: Boolean(input.weatherActive),
    p_peak_active: ctx.peakActive,
    p_bonus_pay: 0,
  });

  const driver = {
    base_pay: Number(driverCalc.data?.base_pay ?? 0),
    mileage_pay: Number(driverCalc.data?.mileage_pay ?? 0),
    time_pay: Number(driverCalc.data?.time_pay ?? 0),
    wait_pay: Number(driverCalc.data?.wait_pay ?? 0),
    bonus_pay: Number(driverCalc.data?.bonus_pay ?? 0),
    weather_bonus: Number(driverCalc.data?.weather_bonus ?? 0),
    peak_bonus: Number(driverCalc.data?.peak_bonus ?? 0),
    large_order_bonus: Number(driverCalc.data?.large_order_bonus ?? 0),
    long_distance_bonus: Number(driverCalc.data?.long_distance_bonus ?? 0),
    customer_tip: Number(driverCalc.data?.customer_tip ?? tipAmount),
    guaranteed_pay: Number(driverCalc.data?.guaranteed_pay ?? 0),
    final_driver_pay: Number(driverCalc.data?.final_driver_pay ?? 0),
  };

  const restaurantCalc = await rpcJson(db, "calculate_restaurant_payout", {
    p_gross_sales: subtotal,
    p_promotion_adjustment: 0,
    p_refund_adjustment: 0,
    p_chargeback_adjustment: 0,
    p_include_stripe_fee: false,
    p_commission_percent: ctx.commissionPercent,
  });

  const restaurant = {
    gross_sales: Number(restaurantCalc.data?.gross_sales ?? subtotal),
    commission_amount: Number(restaurantCalc.data?.commission_amount ?? 0),
    commission_percent:
      restaurantCalc.data?.commission_percent != null
        ? Number(restaurantCalc.data.commission_percent)
        : ctx.commissionPercent,
    net_payout: Number(restaurantCalc.data?.net_payout ?? 0),
  };

  const deliveryRevenue =
    customer.delivery_fee +
    customer.distance_fee +
    customer.surge_fee +
    customer.weather_fee +
    customer.small_order_fee;

  const stripeCost = round2(customer.customer_total * 0.029 + 0.3);

  const platformCalc = await rpcJson(db, "calculate_platform_profit", {
    p_delivery_revenue: deliveryRevenue,
    p_service_fee_revenue: customer.service_fee,
    p_commission_revenue: restaurant.commission_amount,
    p_advertising_revenue: 0,
    p_subscription_revenue: 0,
    p_driver_cost: driver.final_driver_pay,
    p_restaurant_cost: restaurant.net_payout,
    p_stripe_cost: stripeCost,
    p_refund_cost: 0,
    p_promotion_cost: customer.discount_amount,
  });

  const platform = {
    delivery_revenue: Number(platformCalc.data?.delivery_revenue ?? deliveryRevenue),
    service_fee_revenue: Number(platformCalc.data?.service_fee_revenue ?? customer.service_fee),
    commission_revenue: Number(platformCalc.data?.commission_revenue ?? restaurant.commission_amount),
    stripe_cost: Number(platformCalc.data?.stripe_cost ?? stripeCost),
    driver_cost: Number(platformCalc.data?.driver_cost ?? driver.final_driver_pay),
    restaurant_cost: Number(platformCalc.data?.restaurant_cost ?? restaurant.net_payout),
    net_profit: Number(platformCalc.data?.net_profit ?? 0),
  };

  let profitProtected = false;
  let blocked = false;
  let blockReason: string | undefined;

  if (!input.skipProfitProtection && platform.net_profit < minProfit) {
    if (subsidyAllowed) {
      profitProtected = true;
    } else if (platform.net_profit < 0) {
      blocked = true;
      blockReason = "This order cannot be fulfilled at current pricing. Please try again later or contact support.";
    } else {
      const adjusted = await applyProfitProtection(db, customer, platform, minProfit);
      if (adjusted) {
        customer.delivery_fee = adjusted.delivery_fee;
        customer.service_fee = adjusted.service_fee;
        customer.customer_total = adjusted.customer_total;
        platform.net_profit = adjusted.net_profit;
        platform.delivery_revenue = adjusted.delivery_revenue;
        platform.service_fee_revenue = adjusted.service_fee;
        profitProtected = true;
      } else if (platform.net_profit < minProfit) {
        blocked = true;
        blockReason = "Delivery is temporarily unavailable for this order due to pricing constraints.";
      }
    }
  }

  return {
    version,
    distance_miles: ctx.distanceMiles,
    estimated_drive_minutes: ctx.driveMinutes,
    surge_multiplier: ctx.surgeMultiplier,
    peak_active: ctx.peakActive,
    customer,
    driver,
    restaurant,
    platform,
    profit_protected: profitProtected,
    subsidy_allowed: subsidyAllowed,
    blocked,
    block_reason: blockReason,
  };
}

async function applyProfitProtection(
  db: SupabaseClient,
  customer: PricingQuote["customer"],
  platform: PricingQuote["platform"],
  minProfit: number
): Promise<{ delivery_fee: number; service_fee: number; customer_total: number; net_profit: number; delivery_revenue: number } | null> {
  const [{ data: deliveryRule }, { data: serviceRule }] = await Promise.all([
    db.from("pricing_rules").select("minimum_amount,maximum_amount").eq("rule_type", "delivery_fee").eq("active", true).limit(1).maybeSingle(),
    db.from("pricing_rules").select("minimum_amount,maximum_amount").eq("rule_type", "service_fee").eq("active", true).limit(1).maybeSingle(),
  ]);

  const deliveryMin = Number(deliveryRule?.minimum_amount ?? 1.99);
  const deliveryMax = Number(deliveryRule?.maximum_amount ?? 9.99);
  const serviceMin = Number(serviceRule?.minimum_amount ?? 0.99);
  const serviceMax = Number(serviceRule?.maximum_amount ?? 4.99);

  const deficit = round2(minProfit - platform.net_profit);
  if (deficit <= 0) return null;

  let newDeliveryFee = customer.delivery_fee;
  let newServiceFee = customer.service_fee;
  let remaining = deficit;

  const deliveryHeadroom = round2(deliveryMax - newDeliveryFee);
  if (deliveryHeadroom > 0) {
    const bump = Math.min(deliveryHeadroom, remaining);
    newDeliveryFee = round2(newDeliveryFee + bump);
    remaining = round2(remaining - bump);
  }

  if (remaining > 0) {
    const serviceHeadroom = round2(serviceMax - newServiceFee);
    if (serviceHeadroom > 0) {
      const bump = Math.min(serviceHeadroom, remaining);
      newServiceFee = round2(newServiceFee + bump);
      remaining = round2(remaining - bump);
    }
  }

  if (remaining > 0) return null;

  const deliveryRevenue =
    newDeliveryFee +
    customer.distance_fee +
    customer.surge_fee +
    customer.weather_fee +
    customer.small_order_fee;

  const customerTotal = round2(
    customer.subtotal +
      customer.tax_amount +
      deliveryRevenue +
      newServiceFee -
      customer.discount_amount +
      customer.tip_amount
  );

  const newProfit = round2(
    deliveryRevenue +
      newServiceFee +
      platform.commission_revenue -
      platform.driver_cost -
      platform.restaurant_cost -
      platform.stripe_cost -
      customer.discount_amount
  );

  if (newProfit < minProfit || newDeliveryFee < deliveryMin || newServiceFee < serviceMin) {
    return null;
  }

  return {
    delivery_fee: newDeliveryFee,
    service_fee: newServiceFee,
    customer_total: customerTotal,
    net_profit: newProfit,
    delivery_revenue: deliveryRevenue,
  };
}

export async function persistPricingSnapshot(
  db: SupabaseClient,
  orderId: string,
  customerId: string,
  restaurantId: string,
  quote: PricingQuote
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.from("pricing_snapshots").insert({
    order_id: orderId,
    customer_id: customerId,
    restaurant_id: restaurantId,
    subtotal: quote.customer.subtotal,
    tax_amount: quote.customer.tax_amount,
    delivery_fee: quote.customer.delivery_fee,
    service_fee: quote.customer.service_fee,
    small_order_fee: quote.customer.small_order_fee,
    distance_fee: quote.customer.distance_fee,
    surge_fee: quote.customer.surge_fee,
    weather_fee: quote.customer.weather_fee,
    discount_amount: quote.customer.discount_amount,
    tip_amount: quote.customer.tip_amount,
    customer_total: quote.customer.customer_total,
    driver_payout: quote.driver.final_driver_pay,
    restaurant_payout: quote.restaurant.net_payout,
    platform_revenue: round2(
      quote.platform.delivery_revenue +
        quote.platform.service_fee_revenue +
        quote.platform.commission_revenue
    ),
    stripe_fee: quote.platform.stripe_cost,
    estimated_profit: quote.platform.net_profit,
    pricing_version: quote.version,
    rule_snapshot: {
      distance_miles: quote.distance_miles,
      estimated_drive_minutes: quote.estimated_drive_minutes,
      surge_multiplier: quote.surge_multiplier,
      peak_active: quote.peak_active,
      driver: quote.driver,
      restaurant: quote.restaurant,
      platform: quote.platform,
      profit_protected: quote.profit_protected,
      subsidy_allowed: quote.subsidy_allowed,
    },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
