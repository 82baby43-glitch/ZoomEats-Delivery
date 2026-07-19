export interface PricingQuoteInput {
  subtotal: number;
  restaurantId: string;
  customerId?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  tipAmount?: number;
  discountAmount?: number;
  promoCode?: string | null;
  weatherActive?: boolean;
  /** Admin test mode — allows negative-profit orders */
  allowSubsidy?: boolean;
  /** Skip profit protection fee adjustments */
  skipProfitProtection?: boolean;
}

export interface CustomerBreakdown {
  subtotal: number;
  tax_amount: number;
  delivery_fee: number;
  service_fee: number;
  small_order_fee: number;
  distance_fee: number;
  surge_fee: number;
  weather_fee: number;
  discount_amount: number;
  tip_amount: number;
  customer_total: number;
}

export interface DriverBreakdown {
  base_pay: number;
  mileage_pay: number;
  time_pay: number;
  wait_pay: number;
  bonus_pay: number;
  weather_bonus: number;
  peak_bonus: number;
  large_order_bonus: number;
  long_distance_bonus: number;
  customer_tip: number;
  guaranteed_pay: number;
  final_driver_pay: number;
}

export interface RestaurantBreakdown {
  gross_sales: number;
  commission_amount: number;
  commission_percent: number | null;
  commission_plan_slug?: string | null;
  net_payout: number;
}

export interface PlatformBreakdown {
  delivery_revenue: number;
  service_fee_revenue: number;
  commission_revenue: number;
  stripe_cost: number;
  driver_cost: number;
  restaurant_cost: number;
  net_profit: number;
}

export interface PricingQuote {
  version: string;
  distance_miles: number;
  estimated_drive_minutes: number;
  surge_multiplier: number;
  peak_active: boolean;
  customer: CustomerBreakdown;
  driver: DriverBreakdown;
  restaurant: RestaurantBreakdown;
  platform: PlatformBreakdown;
  profit_protected: boolean;
  subsidy_allowed: boolean;
  blocked: boolean;
  block_reason?: string;
  free_delivery?: { eligible: boolean; reason: string | null };
  customer_lines?: Array<{
    key: string;
    label: string;
    amount: number;
    isDiscount?: boolean;
    isTotal?: boolean;
    meta?: string;
  }>;
  delivery_calculator?: Record<string, number | string | boolean | null>;
  repriced_items?: Array<{
    item_id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
}
