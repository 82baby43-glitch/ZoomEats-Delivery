/** ZoomEats Pricing Engine — shared types (single source of truth for money shapes) */

export type PricingRuleRow = {
  id: string;
  rule_name: string;
  rule_type: string;
  value: number;
  percentage: number | null;
  minimum_amount: number | null;
  maximum_amount: number | null;
  active: boolean;
  effective_date: string;
};

export type CartLineInput = {
  item_id: string;
  name?: string;
  price: number;
  quantity: number;
};

export type MarketplaceConditions = {
  distanceMiles?: number;
  estimatedTravelMinutes?: number;
  restaurantPrepMinutes?: number;
  waitMinutes?: number;
  trafficDelayMinutes?: number;
  trafficMultiplier?: number;
  weatherActive?: boolean;
  weatherSeverity?: number;
  demandLevel?: "low" | "normal" | "high" | "peak";
  surgeMultiplier?: number;
  tipAmount?: number;
  promoCode?: string | null;
  discountAmount?: number;
  membershipPlan?: "free" | "plus" | "unlimited" | null;
  driverTier?: "bronze" | "silver" | "gold" | "platinum" | null;
  restaurantTier?: "standard" | "preferred" | "premier" | "partner" | null;
  multiPickupCount?: number;
  consecutiveDeliveryStreak?: number;
  advertisingRevenue?: number;
  subscriptionRevenue?: number;
  refundAdjustment?: number;
  chargebackAdjustment?: number;
  promotionAdjustment?: number;
  includeStripeFeeOnRestaurant?: boolean;
};

export type CalculateOrderPricingInput = {
  restaurantId: string;
  customerId?: string | null;
  driverId?: string | null;
  cartItems: CartLineInput[];
  conditions?: MarketplaceConditions;
};

export type OrderPricingResult = {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  serviceFee: number;
  smallOrderFee: number;
  distanceFee: number;
  surgeFee: number;
  weatherFee: number;
  discounts: number;
  customerTotal: number;

  baseDriverPay: number;
  mileagePay: number;
  timePay: number;
  waitPay: number;
  trafficPay: number;
  bonuses: number;
  weatherBonus: number;
  peakBonus: number;
  largeOrderBonus: number;
  multiPickupBonus: number;
  consecutiveBonus: number;
  performanceBonus: number;
  customerTip: number;
  driverGuaranteedPay: number;
  finalDriverPay: number;

  restaurantCommission: number;
  restaurantPayout: number;

  stripeFees: number;
  platformRevenue: number;
  netProfit: number;

  /** Transparent breakdown for receipts / driver offer / admin */
  meta: {
    distanceMiles: number;
    estimatedTravelMinutes: number;
    waitMinutes: number;
    demandLevel: string;
    surgeMultiplier: number;
    weatherActive: boolean;
    membershipPlan: string | null;
    driverTier: string | null;
    restaurantTier: string | null;
    promoCode: string | null;
    ruleVersion: string;
    calculatedAt: string;
  };
};

export type AiPricingRecommendation = {
  id: string;
  category: "driver_incentive" | "customer_discount" | "fee_adjustment" | "commission_adjustment";
  title: string;
  rationale: string;
  suggestedRuleType: string;
  suggestedValue: number;
  suggestedPercentage: number | null;
  withinLimits: boolean;
  minBound: number | null;
  maxBound: number | null;
  confidence: number;
};

export type DriverOfferQuote = {
  order_id: string;
  restaurant_name: string;
  restaurant_address: string | null;
  customer_distance_miles: number;
  estimated_delivery_minutes: number;
  guaranteed_earnings: number;
  tip_estimate: number;
  bonus_total: number;
  bonus_breakdown: Record<string, number>;
  final_driver_pay: number;
};
