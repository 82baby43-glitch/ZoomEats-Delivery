/** Map Google Places primary types to ZoomEats business + marketplace categories. */

export type BusinessCategory =
  | "restaurant"
  | "cafe"
  | "food_truck"
  | "bakery"
  | "convenience_store"
  | "liquor_store"
  | "grocery_store"
  | "pharmacy"
  | "retail";

export const BUSINESS_CATEGORY_LABELS: Record<BusinessCategory, string> = {
  restaurant: "Restaurant",
  cafe: "Cafe",
  food_truck: "Food Truck",
  bakery: "Bakery",
  convenience_store: "Convenience Store",
  liquor_store: "Liquor Store",
  grocery_store: "Grocery Store",
  pharmacy: "Pharmacy",
  retail: "Local Retail",
};

const GOOGLE_TYPE_MAP: Array<{ patterns: string[]; business: BusinessCategory; slug: string }> = [
  { patterns: ["restaurant", "meal_delivery", "meal_takeaway", "fast_food_restaurant", "pizza_restaurant"], business: "restaurant", slug: "restaurants" },
  { patterns: ["cafe", "coffee_shop"], business: "cafe", slug: "coffee_shops" },
  { patterns: ["bakery"], business: "bakery", slug: "bakeries" },
  { patterns: ["food_truck"], business: "food_truck", slug: "restaurants" },
  { patterns: ["convenience_store"], business: "convenience_store", slug: "convenience_stores" },
  { patterns: ["liquor_store", "wine_shop"], business: "liquor_store", slug: "liquor_stores" },
  { patterns: ["grocery_store", "supermarket", "grocery_or_supermarket"], business: "grocery_store", slug: "grocery_stores" },
  { patterns: ["pharmacy", "drugstore"], business: "pharmacy", slug: "health_wellness_stores" },
  { patterns: ["store", "shopping_mall", "clothing_store", "home_goods_store", "gift_shop"], business: "retail", slug: "local_retail" },
];

export function mapGoogleTypesToCategories(primaryType?: string | null, types?: string[] | null) {
  const candidates = [primaryType, ...(types || [])]
    .map((t) => String(t || "").toLowerCase())
    .filter(Boolean);

  for (const entry of GOOGLE_TYPE_MAP) {
    if (candidates.some((c) => entry.patterns.some((p) => c.includes(p) || p.includes(c)))) {
      return { business_category: entry.business, merchant_category_slug: entry.slug };
    }
  }

  return { business_category: "restaurant" as BusinessCategory, merchant_category_slug: "restaurants" };
}

export function businessCategoryLabel(category?: string | null): string {
  if (!category) return "Local Business";
  return BUSINESS_CATEGORY_LABELS[category as BusinessCategory] || category.replace(/_/g, " ");
}

export function isClaimableBusinessStatus(status?: string | null): boolean {
  const normalized = String(status || "").toUpperCase();
  return !normalized || normalized === "OPERATIONAL";
}
