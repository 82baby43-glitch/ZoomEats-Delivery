import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingQuote } from "./types.ts";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type ProfitProtectionAction = "passed" | "adjusted" | "subsidized" | "blocked";

export type ProfitProtectionDecision = {
  action: ProfitProtectionAction;
  min_profit_required: number;
  profit_before: number;
  profit_after: number;
  subsidy_allowed: boolean;
  blocked: boolean;
  block_reason?: string;
  delivery_fee_before: number;
  delivery_fee_after: number;
  service_fee_before: number;
  service_fee_after: number;
  customer_total: number;
};

export async function applyProfitProtectionAdjustments(
  db: SupabaseClient,
  customer: PricingQuote["customer"],
  platform: PricingQuote["platform"],
  minProfit: number
): Promise<{
  delivery_fee: number;
  service_fee: number;
  customer_total: number;
  net_profit: number;
  delivery_revenue: number;
} | null> {
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

export async function evaluateProfitProtection(
  db: SupabaseClient,
  customer: PricingQuote["customer"],
  platform: PricingQuote["platform"],
  options: { minProfit?: number; subsidyAllowed?: boolean; skip?: boolean }
): Promise<ProfitProtectionDecision> {
  const minProfit =
    options.minProfit ??
    Number(
      (
        await db
          .from("pricing_rules")
          .select("value")
          .eq("rule_type", "min_platform_profit")
          .eq("active", true)
          .limit(1)
          .maybeSingle()
      ).data?.value ?? 1.5
    );

  const subsidyAllowed = Boolean(options.subsidyAllowed);
  const profitBefore = platform.net_profit;
  const base: ProfitProtectionDecision = {
    action: "passed",
    min_profit_required: minProfit,
    profit_before: profitBefore,
    profit_after: profitBefore,
    subsidy_allowed: subsidyAllowed,
    blocked: false,
    delivery_fee_before: customer.delivery_fee,
    delivery_fee_after: customer.delivery_fee,
    service_fee_before: customer.service_fee,
    service_fee_after: customer.service_fee,
    customer_total: customer.customer_total,
  };

  if (options.skip || profitBefore >= minProfit) {
    return base;
  }

  if (subsidyAllowed) {
    return { ...base, action: "subsidized", profit_after: profitBefore };
  }

  if (profitBefore < 0) {
    return {
      ...base,
      action: "blocked",
      blocked: true,
      block_reason:
        "This order cannot be fulfilled at current pricing. Please try again later or contact support.",
    };
  }

  const adjusted = await applyProfitProtectionAdjustments(db, customer, platform, minProfit);
  if (adjusted) {
    return {
      ...base,
      action: "adjusted",
      profit_after: adjusted.net_profit,
      delivery_fee_after: adjusted.delivery_fee,
      service_fee_after: adjusted.service_fee,
      customer_total: adjusted.customer_total,
    };
  }

  return {
    ...base,
    action: "blocked",
    blocked: true,
    block_reason: "Delivery is temporarily unavailable for this order due to pricing constraints.",
  };
}

export async function logProfitProtectionDecision(
  db: SupabaseClient,
  decision: ProfitProtectionDecision,
  meta: {
    orderId?: string;
    restaurantId?: string;
    customerId?: string;
    surge_multiplier?: number;
    distance_miles?: number;
  } = {}
) {
  if (decision.action === "passed") return;
  await db.from("profit_protection_logs").insert({
    order_id: meta.orderId ?? null,
    restaurant_id: meta.restaurantId ?? null,
    customer_id: meta.customerId ?? null,
    action: decision.action,
    min_profit_required: decision.min_profit_required,
    profit_before: decision.profit_before,
    profit_after: decision.profit_after,
    subsidy_allowed: decision.subsidy_allowed,
    delivery_fee_before: decision.delivery_fee_before,
    delivery_fee_after: decision.delivery_fee_after,
    service_fee_before: decision.service_fee_before,
    service_fee_after: decision.service_fee_after,
    customer_total: decision.customer_total,
    meta,
  });
}

export async function getProfitProtectionSummary(db: SupabaseClient, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: logs } = await db
    .from("profit_protection_logs")
    .select("*")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = logs || [];
  const byAction = rows.reduce(
    (acc, r) => {
      const k = String(r.action);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    period_days: days,
    total_events: rows.length,
    passed: byAction.passed ?? 0,
    adjusted: byAction.adjusted ?? 0,
    subsidized: byAction.subsidized ?? 0,
    blocked: byAction.blocked ?? 0,
    recent: rows.slice(0, 20),
  };
}
