/**
 * Restaurant Intelligence Preparation Layer (v2.0)
 * Backend stubs for future restaurant dashboard AI tools — not activated in UI.
 */

export type RestaurantIntelSnapshot = {
  restaurant_id: string;
  trending_items: string[];
  promotion_suggestions: string[];
  customer_preference_summary: string;
  ai_menu_ready: boolean;
};

export function buildRestaurantIntelStub(restaurantId: string): RestaurantIntelSnapshot {
  return {
    restaurant_id: restaurantId,
    trending_items: [],
    promotion_suggestions: [],
    customer_preference_summary: "Analytics layer ready — connect restaurant dashboard to activate.",
    ai_menu_ready: false,
  };
}

export const RESTAURANT_INTEL_FEATURES = [
  "ai_menu_descriptions",
  "promotion_suggestions",
  "trending_item_insights",
  "customer_preference_analytics",
] as const;
