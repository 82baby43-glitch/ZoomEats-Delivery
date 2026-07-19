import type { SupabaseClient } from "@supabase/supabase-js";
import { getTimeOfDayMultiplier } from "../routing/traffic-ai.ts";
import { milesBetween, estimateDriveMinutes } from "./geo.ts";
import { computeSurgeMultiplier } from "./surge.ts";
import { deliveryStackTotal, formatCustomerPricingLines, summarizeDeliveryCalculator } from "./customer.ts";
import { evaluateProfitProtection, logProfitProtectionDecision } from "./profitProtection.ts";
import { resolveCommissionRate } from "../restaurantCommission/engine.ts";
import type { PricingQuote, PricingQuoteInput } from "./types.ts";

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
  commissionPlanSlug: string | null;
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
  let commissionPlanSlug: string | null = null;
  if (input.restaurantId) {
    const resolved = await resolveCommissionRate(db, input.restaurantId);
    commissionPercent = resolved.commission_percent;
    commissionPlanSlug = resolved.plan_slug;
  }

  return {
    distanceMiles: round2(distanceMiles),
    driveMinutes,
    surgeMultiplier: surge.multiplier,
    peakActive: surge.peakActive,
    commissionPercent,
    commissionPlanSlug,
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

  const freeDelivery = await applyFreeDeliveryBenefits(db, input, customer);
  if (freeDelivery.applied) {
    customer.discount_amount = round2(customer.discount_amount + freeDelivery.discountAdded);
    customer.customer_total = round2(
      customer.subtotal +
        customer.tax_amount +
        deliveryStackTotal(customer) +
        customer.service_fee -
        customer.discount_amount +
        customer.tip_amount
    );
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
    commission_plan_slug: ctx.commissionPlanSlug,
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

  const profitDecision = await evaluateProfitProtection(db, customer, platform, {
    minProfit,
    subsidyAllowed,
    skip: input.skipProfitProtection,
  });

  if (profitDecision.action === "adjusted" && profitDecision.delivery_fee_after !== customer.delivery_fee) {
    customer.delivery_fee = profitDecision.delivery_fee_after;
    customer.service_fee = profitDecision.service_fee_after;
    customer.customer_total = profitDecision.customer_total;
    platform.net_profit = profitDecision.profit_after;
    platform.delivery_revenue =
      customer.delivery_fee +
      customer.distance_fee +
      customer.surge_fee +
      customer.weather_fee +
      customer.small_order_fee;
    platform.service_fee_revenue = customer.service_fee;
    profitProtected = true;
  } else if (profitDecision.action === "subsidized") {
    profitProtected = true;
  } else if (profitDecision.blocked) {
    blocked = true;
    blockReason = profitDecision.block_reason;
  }

  if (!input.skipProfitProtection && profitDecision.action !== "passed") {
    await logProfitProtectionDecision(db, profitDecision, {
      restaurantId: input.restaurantId,
      customerId: input.customerId ?? undefined,
      surge_multiplier: ctx.surgeMultiplier,
      distance_miles: ctx.distanceMiles,
    });
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
    free_delivery: {
      eligible: freeDelivery.eligible,
      reason: freeDelivery.reason,
    },
    customer_lines: formatCustomerPricingLines(
      {
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
        free_delivery: { eligible: freeDelivery.eligible, reason: freeDelivery.reason },
      },
      { promoCode: input.promoCode, freeDeliveryApplied: freeDelivery.applied }
    ),
    delivery_calculator: summarizeDeliveryCalculator({
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
      free_delivery: { eligible: freeDelivery.eligible, reason: freeDelivery.reason },
    }),
  };
}

async function applyFreeDeliveryBenefits(
  db: SupabaseClient,
  input: PricingQuoteInput,
  customer: PricingQuote["customer"]
): Promise<{ eligible: boolean; applied: boolean; reason: string | null; discountAdded: number }> {
  const stack = deliveryStackTotal(customer);
  if (stack <= 0) {
    return { eligible: false, applied: false, reason: null, discountAdded: 0 };
  }

  if (input.customerId) {
    const { data: membership } = await db
      .from("customer_memberships")
      .select("plan,status,expiration_date")
      .eq("customer_id", input.customerId)
      .eq("status", "active")
      .maybeSingle();

    if (membership && ["plus", "unlimited"].includes(String(membership.plan))) {
      const expired = membership.expiration_date && new Date(String(membership.expiration_date)) < new Date();
      if (!expired) {
        const remaining = round2(Math.max(0, stack - customer.discount_amount));
        return {
          eligible: true,
          applied: remaining > 0,
          reason: `${membership.plan} membership`,
          discountAdded: remaining,
        };
      }
    }
  }

  if (input.promoCode) {
    const { data: promo } = await db
      .from("promotions")
      .select("*")
      .ilike("code", String(input.promoCode).trim())
      .eq("active", true)
      .maybeSingle();

    if (promo?.discount_type === "free_delivery") {
      const alreadyDiscounted = customer.discount_amount;
      const fullFree = round2(Math.max(0, stack - Math.min(alreadyDiscounted, stack)));
      return {
        eligible: true,
        applied: fullFree > 0,
        reason: `Promo ${promo.code}`,
        discountAdded: fullFree,
      };
    }
  }

  return { eligible: false, applied: false, reason: null, discountAdded: 0 };
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
