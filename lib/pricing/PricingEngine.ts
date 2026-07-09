/**
 * ZoomEats PricingEngine — single source of truth for marketplace money.
 * All customer / driver / restaurant / platform calculations live here.
 * Clients must never reimplement these formulas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { clamp, roundMoney } from "./money";
import { getCachedPricingRules, ruleByType } from "./rulesCache";
import type {
  CalculateOrderPricingInput,
  MarketplaceConditions,
  OrderPricingResult,
  PricingRuleRow,
} from "./types";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function applyBounds(amount: number, rule: PricingRuleRow | null): number {
  if (!rule) return amount;
  return clamp(amount, rule.minimum_amount, rule.maximum_amount);
}

function demandToSurge(level: MarketplaceConditions["demandLevel"], explicit?: number): number {
  if (explicit != null && explicit > 0) return explicit;
  switch (level) {
    case "low":
      return 1;
    case "high":
      return 1.25;
    case "peak":
      return 1.5;
    default:
      return 1;
  }
}

function tierDriverBonus(tier: MarketplaceConditions["driverTier"]): number {
  switch (tier) {
    case "silver":
      return 0.5;
    case "gold":
      return 1;
    case "platinum":
      return 1.5;
    default:
      return 0;
  }
}

function membershipDeliveryDiscount(
  plan: MarketplaceConditions["membershipPlan"],
  deliveryFee: number
): number {
  if (plan === "plus") return roundMoney(deliveryFee * 0.5);
  if (plan === "unlimited") return deliveryFee;
  return 0;
}

export function computeSubtotal(
  items: Array<{ price: number; quantity: number }>
): number {
  return roundMoney(
    items.reduce((s, it) => s + num(it.price) * Math.max(1, Math.min(num(it.quantity, 1), 99)), 0)
  );
}

/**
 * Pure calculation from loaded rules + conditions.
 * Prefer calculateOrderPricing() which loads rules + context from DB.
 */
export function calculateOrderPricingFromRules(
  rules: PricingRuleRow[],
  subtotal: number,
  conditions: MarketplaceConditions = {}
): OrderPricingResult {
  const distanceMiles = Math.max(0, num(conditions.distanceMiles));
  const travelMin = Math.max(0, num(conditions.estimatedTravelMinutes));
  const prepMin = Math.max(0, num(conditions.restaurantPrepMinutes));
  const waitMin = Math.max(
    0,
    num(conditions.waitMinutes, Math.max(0, prepMin - 10))
  );
  const trafficDelay = Math.max(0, num(conditions.trafficDelayMinutes));
  const weatherActive = !!conditions.weatherActive;
  const demandLevel = conditions.demandLevel || "normal";
  const surgeMultiplier = demandToSurge(demandLevel, conditions.surgeMultiplier);
  const tipAmount = Math.max(0, num(conditions.tipAmount));
  let discountAmount = Math.max(0, num(conditions.discountAmount));
  const membershipPlan = conditions.membershipPlan || null;
  const driverTier = conditions.driverTier || null;
  const restaurantTier = conditions.restaurantTier || null;
  const multiPickup = Math.max(0, Math.floor(num(conditions.multiPickupCount)));
  const consecutive = Math.max(0, Math.floor(num(conditions.consecutiveDeliveryStreak)));

  const deliveryRule = ruleByType(rules, "delivery_fee");
  const serviceRule = ruleByType(rules, "service_fee");
  const smallFeeRule = ruleByType(rules, "small_order_fee");
  const smallThrRule = ruleByType(rules, "small_order_threshold");
  const distanceRule = ruleByType(rules, "distance_fee");
  const surgeCapRule = ruleByType(rules, "surge_limit");
  const weatherFeeRule = ruleByType(rules, "weather_fee");
  const taxRule = ruleByType(rules, "tax_rate");
  const commissionRule = ruleByType(rules, "commission_rate");
  const stripePctRule = ruleByType(rules, "stripe_fee_percent");
  const stripeFixedRule = ruleByType(rules, "stripe_fee_fixed");

  const basePayRule = ruleByType(rules, "driver_base_pay");
  const mileageRule = ruleByType(rules, "mileage_rate");
  const timeRule = ruleByType(rules, "time_rate");
  const waitRule = ruleByType(rules, "wait_rate");
  const peakRule = ruleByType(rules, "peak_bonus");
  const largeBonusRule = ruleByType(rules, "large_order_bonus");
  const largeThrRule = ruleByType(rules, "large_order_threshold");
  const guaranteeRule = ruleByType(rules, "guaranteed_pay");

  // ---- Customer fees ----
  const deliveryFee = applyBounds(num(deliveryRule?.value, 2.99), deliveryRule);
  let serviceFee = 0;
  if (serviceRule?.percentage != null && serviceRule.percentage > 0) {
    serviceFee = roundMoney(subtotal * (serviceRule.percentage / 100));
  } else {
    serviceFee = num(serviceRule?.value);
  }
  serviceFee = applyBounds(serviceFee, serviceRule);

  let smallOrderFee = 0;
  if (smallThrRule && subtotal < num(smallThrRule.value, 12)) {
    smallOrderFee = num(smallFeeRule?.value, 1.5);
  }

  let distanceFee = 0;
  if (distanceMiles > 0) {
    distanceFee = roundMoney(distanceMiles * num(distanceRule?.value, 0.5));
    distanceFee = applyBounds(distanceFee, distanceRule);
  }

  let surgeFee = 0;
  if (surgeMultiplier > 1) {
    surgeFee = roundMoney(deliveryFee * (surgeMultiplier - 1));
    if (surgeCapRule) surgeFee = Math.min(surgeFee, num(surgeCapRule.value, 5));
  }

  let weatherFee = 0;
  if (weatherActive) weatherFee = num(weatherFeeRule?.value, 1);

  // Membership delivery discount (additive to other discounts)
  discountAmount = roundMoney(
    discountAmount + membershipDeliveryDiscount(membershipPlan, deliveryFee)
  );

  const feeSum =
    deliveryFee + serviceFee + smallOrderFee + distanceFee + surgeFee + weatherFee;
  discountAmount = Math.min(discountAmount, subtotal + feeSum);

  let tax = 0;
  if (taxRule?.percentage != null && taxRule.percentage > 0) {
    const taxable = Math.max(subtotal - Math.min(discountAmount, subtotal), 0);
    tax = roundMoney(taxable * (taxRule.percentage / 100));
  }

  const customerTotal = roundMoney(
    Math.max(0, subtotal + tax + feeSum - discountAmount + tipAmount)
  );

  // ---- Driver pay (tips NEVER reduce base compensation) ----
  const baseDriverPay = num(basePayRule?.value, 3);
  const mileagePay = roundMoney(distanceMiles * num(mileageRule?.value, 0.75));
  const timePay = roundMoney(travelMin * num(timeRule?.value, 0.2));
  const waitPay = roundMoney(waitMin * num(waitRule?.value, 0.15));
  const trafficPay = roundMoney(trafficDelay * num(waitRule?.value, 0.15));

  const weatherBonus = weatherActive ? num(weatherFeeRule?.value, 1) : 0;
  const peakBonus =
    demandLevel === "peak" || demandLevel === "high" ? num(peakRule?.value, 2) : 0;
  const largeOrderBonus =
    largeThrRule && subtotal >= num(largeThrRule.value, 50)
      ? num(largeBonusRule?.value, 3)
      : 0;
  const multiPickupBonus = multiPickup > 1 ? roundMoney((multiPickup - 1) * 1.5) : 0;
  const consecutiveBonus = consecutive >= 3 ? roundMoney(Math.min(consecutive, 10) * 0.5) : 0;
  const performanceBonus = tierDriverBonus(driverTier);

  const bonuses = roundMoney(
    weatherBonus +
      peakBonus +
      largeOrderBonus +
      multiPickupBonus +
      consecutiveBonus +
      performanceBonus
  );

  const computedDriver =
    baseDriverPay + mileagePay + timePay + waitPay + trafficPay + bonuses;
  const driverGuaranteedPay = num(guaranteeRule?.value, 6);
  // Tip is 100% to driver and stacked on top of guaranteed floor
  const finalDriverPay = roundMoney(Math.max(computedDriver, driverGuaranteedPay) + tipAmount);

  // ---- Restaurant payout ----
  let restaurantCommission = 0;
  if (commissionRule?.percentage != null) {
    let rate = commissionRule.percentage;
    // Preferred tiers get a small commission relief (still within admin rule)
    if (restaurantTier === "premier" || restaurantTier === "partner") rate = Math.max(rate - 2, 5);
    else if (restaurantTier === "preferred") rate = Math.max(rate - 1, 5);
    restaurantCommission = roundMoney(subtotal * (rate / 100));
  } else {
    restaurantCommission = num(commissionRule?.value);
  }

  const promoAdj = num(conditions.promotionAdjustment);
  const refundAdj = num(conditions.refundAdjustment);
  const chargebackAdj = num(conditions.chargebackAdjustment);
  const includeStripeOnRest = !!conditions.includeStripeFeeOnRestaurant;

  const stripeFees = roundMoney(
    customerTotal * (num(stripePctRule?.percentage, 2.9) / 100) +
      num(stripeFixedRule?.value, 0.3)
  );

  const restaurantStripeShare = includeStripeOnRest ? stripeFees : 0;
  const restaurantPayout = roundMoney(
    subtotal - restaurantCommission + promoAdj - refundAdj - chargebackAdj - restaurantStripeShare
  );

  // ---- Platform economics ----
  const deliveryRevenue = roundMoney(deliveryFee + distanceFee + surgeFee + weatherFee);
  const serviceFeeRevenue = serviceFee + smallOrderFee;
  const commissionRevenue = restaurantCommission;
  const advertisingRevenue = num(conditions.advertisingRevenue);
  const subscriptionRevenue = num(conditions.subscriptionRevenue);
  // Driver cost excludes tip (tip is pass-through from customer)
  const driverCost = roundMoney(finalDriverPay - tipAmount);
  const refundCost = refundAdj;
  const promotionCost = Math.max(discountAmount, 0) + Math.max(-promoAdj, 0);

  const platformRevenue = roundMoney(
    deliveryRevenue +
      serviceFeeRevenue +
      commissionRevenue +
      advertisingRevenue +
      subscriptionRevenue
  );
  const netProfit = roundMoney(
    platformRevenue - driverCost - stripeFees - refundCost - promotionCost
  );

  return {
    subtotal: roundMoney(subtotal),
    tax,
    deliveryFee,
    serviceFee,
    smallOrderFee,
    distanceFee,
    surgeFee,
    weatherFee,
    discounts: discountAmount,
    customerTotal,

    baseDriverPay: roundMoney(baseDriverPay),
    mileagePay,
    timePay,
    waitPay,
    trafficPay,
    bonuses,
    weatherBonus: roundMoney(weatherBonus),
    peakBonus: roundMoney(peakBonus),
    largeOrderBonus: roundMoney(largeOrderBonus),
    multiPickupBonus,
    consecutiveBonus,
    performanceBonus: roundMoney(performanceBonus),
    customerTip: tipAmount,
    driverGuaranteedPay: roundMoney(driverGuaranteedPay),
    finalDriverPay,

    restaurantCommission,
    restaurantPayout,

    stripeFees,
    platformRevenue,
    netProfit,

    meta: {
      distanceMiles: roundMoney(distanceMiles),
      estimatedTravelMinutes: roundMoney(travelMin),
      waitMinutes: roundMoney(waitMin),
      demandLevel,
      surgeMultiplier,
      weatherActive,
      membershipPlan,
      driverTier,
      restaurantTier,
      promoCode: conditions.promoCode || null,
      ruleVersion: "pricing-engine-v2",
      calculatedAt: new Date().toISOString(),
    },
  };
}

async function resolveMembership(
  db: SupabaseClient,
  customerId?: string | null
): Promise<MarketplaceConditions["membershipPlan"]> {
  if (!customerId) return "free";
  const { data } = await db
    .from("customer_memberships")
    .select("plan,status,expiration_date")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return "free";
  if (data.expiration_date && new Date(data.expiration_date) < new Date()) return "free";
  return (data.plan as MarketplaceConditions["membershipPlan"]) || "free";
}

async function resolveDriverTier(
  db: SupabaseClient,
  driverId?: string | null
): Promise<MarketplaceConditions["driverTier"]> {
  if (!driverId) return "bronze";
  const { data } = await db
    .from("driver_metrics")
    .select("tier_level")
    .eq("driver_id", driverId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.tier_level as MarketplaceConditions["driverTier"]) || "bronze";
}

async function resolveRestaurantTier(
  db: SupabaseClient,
  restaurantId: string
): Promise<MarketplaceConditions["restaurantTier"]> {
  const { data } = await db
    .from("restaurant_metrics")
    .select("tier_level")
    .eq("restaurant_id", restaurantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.tier_level as MarketplaceConditions["restaurantTier"]) || "standard";
}

async function resolvePromoDiscount(
  db: SupabaseClient,
  promoCode: string | null | undefined,
  subtotal: number,
  deliveryFee: number
): Promise<number> {
  if (!promoCode || !String(promoCode).trim()) return 0;
  const { data } = await db
    .from("promotions")
    .select("*")
    .ilike("code", String(promoCode).trim())
    .eq("active", true)
    .maybeSingle();
  if (!data) return 0;
  if (data.expiration_date && new Date(data.expiration_date) < new Date()) return 0;
  if (data.usage_limit != null && data.usage_count >= data.usage_limit) return 0;
  if (data.minimum_subtotal != null && subtotal < Number(data.minimum_subtotal)) return 0;
  if (data.discount_type === "percent") {
    return roundMoney(subtotal * (Number(data.discount_value) / 100));
  }
  if (data.discount_type === "fixed") return roundMoney(Number(data.discount_value));
  if (data.discount_type === "free_delivery") return roundMoney(deliveryFee);
  return 0;
}

/**
 * Main PricingEngine entrypoint.
 * Loads cached rules + membership/tier/promo context, returns full marketplace breakdown.
 */
export async function calculateOrderPricing(
  db: SupabaseClient,
  input: CalculateOrderPricingInput
): Promise<OrderPricingResult> {
  const rules = await getCachedPricingRules(db);
  const subtotal = computeSubtotal(input.cartItems || []);
  const conditions: MarketplaceConditions = { ...(input.conditions || {}) };

  if (!conditions.membershipPlan) {
    conditions.membershipPlan = await resolveMembership(db, input.customerId);
  }
  if (!conditions.driverTier) {
    conditions.driverTier = await resolveDriverTier(db, input.driverId);
  }
  if (!conditions.restaurantTier) {
    conditions.restaurantTier = await resolveRestaurantTier(db, input.restaurantId);
  }

  // First pass for delivery fee (needed for free_delivery promos)
  const draft = calculateOrderPricingFromRules(rules, subtotal, conditions);
  const promoExtra = await resolvePromoDiscount(
    db,
    conditions.promoCode,
    subtotal,
    draft.deliveryFee
  );
  if (promoExtra > 0) {
    conditions.discountAmount = roundMoney(num(conditions.discountAmount) + promoExtra);
  }

  return calculateOrderPricingFromRules(rules, subtotal, conditions);
}

/** Validate a client-supplied total against engine output (Stripe safety). */
export function assertPricingIntegrity(
  expected: OrderPricingResult,
  claimedTotal: number,
  toleranceCents = 1
): { ok: true } | { ok: false; reason: string } {
  const expectedCents = Math.round(expected.customerTotal * 100);
  const claimedCents = Math.round(num(claimedTotal) * 100);
  if (Math.abs(expectedCents - claimedCents) > toleranceCents) {
    return {
      ok: false,
      reason: `Price mismatch: expected ${expected.customerTotal} got ${claimedTotal}`,
    };
  }
  if (expected.customerTotal < 0 || expected.finalDriverPay < 0) {
    return { ok: false, reason: "Negative money values rejected" };
  }
  // Tip must not reduce base pay
  if (expected.finalDriverPay + 0.001 < expected.driverGuaranteedPay) {
    return { ok: false, reason: "Driver guarantee violated" };
  }
  return { ok: true };
}

export class PricingEngine {
  constructor(private db: SupabaseClient) {}

  calculateOrderPricing(input: CalculateOrderPricingInput) {
    return calculateOrderPricing(this.db, input);
  }

  async quoteFromSubtotal(subtotal: number, conditions?: MarketplaceConditions) {
    const rules = await getCachedPricingRules(this.db);
    return calculateOrderPricingFromRules(rules, subtotal, conditions || {});
  }
}
