/** Dashboard field metadata — drives admin UI without code changes per rule. */

export type RuleField = "value" | "percentage" | "minimum_amount" | "maximum_amount";

export type DashboardRule = {
  type: string;
  label: string;
  help?: string;
  fields: RuleField[];
};

export type DashboardSection = {
  id: string;
  title: string;
  description: string;
  rules: DashboardRule[];
};

export const PRICING_RULES_DASHBOARD: DashboardSection[] = [
  {
    id: "driver",
    title: "Driver Pay",
    description: "Base compensation rates applied to every delivery offer.",
    rules: [
      { type: "driver_base_pay", label: "Base driver pay", help: "Flat amount per delivery", fields: ["value"] },
      { type: "mileage_rate", label: "Per-mile rate", help: "Paid per mile driven", fields: ["value"] },
      { type: "time_rate", label: "Per-minute rate", help: "Paid per minute on route", fields: ["value"] },
    ],
  },
  {
    id: "customer",
    title: "Customer Fees",
    description: "Delivery and service fees shown at checkout.",
    rules: [
      {
        type: "delivery_fee",
        label: "Base delivery fee",
        help: "Flat delivery charge with min/max bounds",
        fields: ["value", "minimum_amount", "maximum_amount"],
      },
      {
        type: "distance_fee",
        label: "Distance rate",
        help: "Per-mile charge added for longer deliveries",
        fields: ["value", "maximum_amount"],
      },
      {
        type: "service_fee",
        label: "Service fee",
        help: "Percentage of subtotal with min/max bounds",
        fields: ["percentage", "minimum_amount", "maximum_amount"],
      },
      { type: "small_order_fee", label: "Small order fee", help: "Fee when subtotal is below threshold", fields: ["value"] },
      { type: "small_order_threshold", label: "Small-order threshold", help: "Subtotal below this triggers small-order fee", fields: ["value"] },
      {
        type: "free_delivery_threshold",
        label: "Free delivery threshold",
        help: "Subtotal at or above this unlocks free delivery messaging",
        fields: ["value"],
      },
      {
        type: "regulatory_fee",
        label: "Regulatory fee",
        help: "Flat or percentage local regulatory fee (set value 0 to disable)",
        fields: ["value", "percentage"],
      },
    ],
  },
  {
    id: "merchant",
    title: "Merchant Commission",
    description: "Platform default when a restaurant has no override or plan.",
    rules: [
      { type: "commission_rate", label: "Default commission rate", help: "Percentage taken from restaurant gross sales", fields: ["percentage"] },
    ],
  },
  {
    id: "surge",
    title: "Surge Multipliers",
    description: "Dynamic pricing when demand is high — no deploy needed to tune.",
    rules: [
      { type: "surge_multiplier_peak", label: "Peak-hour floor", help: "Minimum multiplier during lunch/dinner rush", fields: ["value"] },
      { type: "surge_multiplier_max", label: "Maximum multiplier", help: "Hard cap on surge pricing", fields: ["value"] },
      { type: "surge_demand_cap", label: "Demand sensitivity", help: "How aggressively demand raises multiplier", fields: ["value"] },
      { type: "surge_traffic_floor", label: "Heavy-traffic floor", help: "Minimum multiplier in high-traffic periods", fields: ["value"] },
      { type: "surge_limit", label: "Surge fee cap ($)", help: "Max dollar amount added for surge", fields: ["value"] },
    ],
  },
  {
    id: "platform",
    title: "Platform Protection",
    description: "Margin floors and promotional spend limits.",
    rules: [
      { type: "min_platform_profit", label: "Minimum platform profit", help: "Orders below this trigger fee adjustment or block", fields: ["value"] },
      { type: "promotion_budget", label: "Monthly promotion budget", help: "Cap on total promo discounts per calendar month", fields: ["value"] },
    ],
  },
];

export const FIELD_LABELS: Record<RuleField, string> = {
  value: "Value",
  percentage: "Percentage (%)",
  minimum_amount: "Minimum ($)",
  maximum_amount: "Maximum ($)",
};
