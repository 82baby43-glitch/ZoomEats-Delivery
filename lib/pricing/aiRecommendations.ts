/**
 * AI pricing recommendations — advisory only.
 * All suggestions are clamped to admin-defined rule min/max bounds.
 */
import type { AiPricingRecommendation, PricingRuleRow } from "./types";
import { ruleByType } from "./rulesCache";
import { clamp, roundMoney } from "./money";

export type MarketplaceSignals = {
  availableDrivers?: number;
  openOrders?: number;
  avgRestaurantPrepMinutes?: number;
  avgDistanceMiles?: number;
  trafficMultiplier?: number;
  weatherActive?: boolean;
  hourOfDay?: number;
  eventActive?: boolean;
};

function within(
  value: number,
  rule: PricingRuleRow | null
): { value: number; withinLimits: boolean; minBound: number | null; maxBound: number | null } {
  const minBound = rule?.minimum_amount ?? null;
  const maxBound = rule?.maximum_amount ?? null;
  const clamped = clamp(value, minBound, maxBound);
  return {
    value: roundMoney(clamped),
    withinLimits: Math.abs(clamped - value) < 0.001,
    minBound,
    maxBound,
  };
}

export function recommendPricingAdjustments(
  rules: PricingRuleRow[],
  signals: MarketplaceSignals
): AiPricingRecommendation[] {
  const out: AiPricingRecommendation[] = [];
  const drivers = signals.availableDrivers ?? 5;
  const orders = signals.openOrders ?? 0;
  const hour = signals.hourOfDay ?? new Date().getUTCHours();
  const traffic = signals.trafficMultiplier ?? 1;
  const demandRatio = drivers > 0 ? orders / drivers : orders;

  const peakRule = ruleByType(rules, "peak_bonus");
  const deliveryRule = ruleByType(rules, "delivery_fee");
  const commissionRule = ruleByType(rules, "commission_rate");
  const surgeCap = ruleByType(rules, "surge_limit");

  if (demandRatio >= 2 || (signals.weatherActive && demandRatio >= 1)) {
    const suggested = (peakRule?.value ?? 2) + 1;
    const bound = within(suggested, peakRule);
    out.push({
      id: "rec_driver_peak",
      category: "driver_incentive",
      title: "Increase peak driver bonus",
      rationale: `Order/driver ratio ${demandRatio.toFixed(1)} — raise incentives to protect ETA.`,
      suggestedRuleType: "peak_bonus",
      suggestedValue: bound.value,
      suggestedPercentage: null,
      withinLimits: bound.withinLimits,
      minBound: bound.minBound,
      maxBound: bound.maxBound,
      confidence: Math.min(0.95, 0.55 + demandRatio * 0.1),
    });
  }

  if (demandRatio < 0.4 && hour >= 14 && hour <= 16) {
    const suggested = Math.max((deliveryRule?.value ?? 2.99) - 0.5, deliveryRule?.minimum_amount ?? 1.99);
    const bound = within(suggested, deliveryRule);
    out.push({
      id: "rec_slow_period_fee",
      category: "fee_adjustment",
      title: "Lower delivery fee during slow period",
      rationale: "Low demand mid-afternoon — temporary fee relief can lift conversion.",
      suggestedRuleType: "delivery_fee",
      suggestedValue: bound.value,
      suggestedPercentage: null,
      withinLimits: bound.withinLimits,
      minBound: bound.minBound,
      maxBound: bound.maxBound,
      confidence: 0.62,
    });
  }

  if (signals.eventActive || traffic >= 1.4) {
    const cap = surgeCap?.value ?? 5;
    out.push({
      id: "rec_surge_cap_guard",
      category: "fee_adjustment",
      title: "Hold surge within fairness cap",
      rationale: "Traffic/event pressure detected — keep customer surge at or below admin surge_limit.",
      suggestedRuleType: "surge_limit",
      suggestedValue: roundMoney(cap),
      suggestedPercentage: null,
      withinLimits: true,
      minBound: surgeCap?.minimum_amount ?? 0,
      maxBound: surgeCap?.maximum_amount ?? cap,
      confidence: 0.8,
    });
  }

  if ((signals.avgRestaurantPrepMinutes ?? 0) > 35 && (commissionRule?.percentage ?? 15) > 12) {
    const pct = Math.max((commissionRule?.percentage ?? 15) - 1, 5);
    out.push({
      id: "rec_commission_relief",
      category: "commission_adjustment",
      title: "Temporary commission relief for overloaded kitchens",
      rationale: "High prep times — slight commission relief can improve acceptance without code deploy.",
      suggestedRuleType: "commission_rate",
      suggestedValue: 0,
      suggestedPercentage: pct,
      withinLimits: true,
      minBound: 5,
      maxBound: commissionRule?.percentage ?? 30,
      confidence: 0.58,
    });
  }

  if (demandRatio > 1.5) {
    out.push({
      id: "rec_customer_discount_guard",
      category: "customer_discount",
      title: "Avoid deep discounts while supply is tight",
      rationale: "High demand — prefer driver incentives over customer discounts to protect fulfillment.",
      suggestedRuleType: "service_fee",
      suggestedValue: ruleByType(rules, "service_fee")?.value ?? 0,
      suggestedPercentage: ruleByType(rules, "service_fee")?.percentage ?? 8,
      withinLimits: true,
      minBound: null,
      maxBound: null,
      confidence: 0.7,
    });
  }

  return out;
}
