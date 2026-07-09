/**
 * Pure PricingEngine unit tests (no DB).
 * Run: node --experimental-strip-types tests/pricing/PricingEngine.test.ts
 * or: npx tsx tests/pricing/PricingEngine.test.ts
 */
import {
  assertPricingIntegrity,
  calculateOrderPricingFromRules,
  computeSubtotal,
  recommendPricingAdjustments,
  type PricingRuleRow,
} from "../../lib/pricing";

function rule(
  rule_type: string,
  value: number,
  extra: Partial<PricingRuleRow> = {}
): PricingRuleRow {
  return {
    id: rule_type,
    rule_name: rule_type,
    rule_type,
    value,
    percentage: null,
    minimum_amount: null,
    maximum_amount: null,
    active: true,
    effective_date: new Date().toISOString(),
    ...extra,
  };
}

const rules: PricingRuleRow[] = [
  rule("delivery_fee", 2.99, { minimum_amount: 1.99, maximum_amount: 9.99 }),
  rule("service_fee", 0, { percentage: 8, minimum_amount: 0.99, maximum_amount: 4.99 }),
  rule("small_order_fee", 1.5),
  rule("small_order_threshold", 12),
  rule("distance_fee", 0.5, { maximum_amount: 8 }),
  rule("surge_limit", 5),
  rule("weather_fee", 1),
  rule("tax_rate", 0, { percentage: 8.25 }),
  rule("commission_rate", 0, { percentage: 15 }),
  rule("stripe_fee_percent", 0, { percentage: 2.9 }),
  rule("stripe_fee_fixed", 0.3),
  rule("driver_base_pay", 3),
  rule("mileage_rate", 0.75),
  rule("time_rate", 0.2),
  rule("wait_rate", 0.15),
  rule("peak_bonus", 2),
  rule("large_order_bonus", 3),
  rule("large_order_threshold", 50),
  rule("guaranteed_pay", 6),
];

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`✅ ${msg}`);
  } else {
    failed += 1;
    console.error(`❌ ${msg}`);
  }
}

const subtotal = computeSubtotal([
  { price: 12, quantity: 1 },
  { price: 8.5, quantity: 2 },
]);
assert(subtotal === 29, `subtotal expected 29 got ${subtotal}`);

const pricing = calculateOrderPricingFromRules(rules, subtotal, {
  distanceMiles: 4,
  estimatedTravelMinutes: 20,
  waitMinutes: 5,
  tipAmount: 5,
  demandLevel: "peak",
  weatherActive: true,
  driverTier: "gold",
  membershipPlan: "free",
});

assert(pricing.customerTip === 5, "tip preserved");
assert(pricing.finalDriverPay >= pricing.driverGuaranteedPay + pricing.customerTip - 0.001, "tip stacks on guarantee");
assert(pricing.finalDriverPay > pricing.baseDriverPay, "driver pay includes components");
assert(pricing.customerTotal > pricing.subtotal, "customer total includes fees");
assert(pricing.peakBonus > 0, "peak bonus applied");
assert(pricing.weatherBonus > 0, "weather bonus applied");
assert(pricing.restaurantCommission > 0, "commission applied");
assert(pricing.stripeFees > 0, "stripe fees applied");

const integrity = assertPricingIntegrity(pricing, pricing.customerTotal);
assert(integrity.ok === true, "integrity check passes for matching total");

const bad = assertPricingIntegrity(pricing, pricing.customerTotal + 5);
assert(bad.ok === false, "integrity rejects manipulated total");

// Tip must never reduce base — even with $0 tip, guarantee floor holds
const noTip = calculateOrderPricingFromRules(rules, 5, {
  distanceMiles: 0.5,
  estimatedTravelMinutes: 5,
  tipAmount: 0,
});
assert(noTip.finalDriverPay >= noTip.driverGuaranteedPay, "guarantee floor without tip");

const withTip = calculateOrderPricingFromRules(rules, 5, {
  distanceMiles: 0.5,
  estimatedTravelMinutes: 5,
  tipAmount: 3,
});
assert(
  Math.abs(withTip.finalDriverPay - (noTip.finalDriverPay + 3)) < 0.001,
  "adding tip increases driver pay by tip amount"
);

const recs = recommendPricingAdjustments(rules, {
  availableDrivers: 1,
  openOrders: 5,
  hourOfDay: 18,
  weatherActive: true,
});
assert(recs.length > 0, "AI recommendations produced under high demand");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
