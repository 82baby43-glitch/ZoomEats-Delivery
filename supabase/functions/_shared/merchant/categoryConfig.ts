/** Merchant signup categories and application field configuration. */

export const RESTAURANT_SLUG = "restaurants";
export const CONVENIENCE_SLUG = "convenience_stores";
export const LOCAL_RETAIL_SLUG = "local_retail";
export const LIQUOR_SLUG = "liquor_stores";
export const DISPENSARY_SLUG = "licensed_dispensary";

export const PRIMARY_SIGNUP_SLUGS = [
  RESTAURANT_SLUG,
  CONVENIENCE_SLUG,
  LOCAL_RETAIL_SLUG,
  LIQUOR_SLUG,
] as const;

export type PrimarySignupSlug = (typeof PRIMARY_SIGNUP_SLUGS)[number];

export type MerchantSignupGroup = {
  id: string;
  label: string;
  description: string;
  slugs: readonly string[];
};

export const MERCHANT_SIGNUP_GROUPS: MerchantSignupGroup[] = [
  {
    id: "restaurant_food",
    label: "Restaurant & Food",
    description: "Full-service restaurants, kitchens, and prepared food merchants.",
    slugs: [RESTAURANT_SLUG],
  },
  {
    id: "local_retail",
    label: "Local Retail & Shops",
    description: "Neighborhood stores that sell essentials, specialty goods, and beverages.",
    slugs: [LOCAL_RETAIL_SLUG, CONVENIENCE_SLUG, LIQUOR_SLUG],
  },
];

export type CategoryApplicationConfig = {
  title: string;
  subtitle: string;
  businessCategory: string;
  showCuisine: boolean;
  showFoodPermit: boolean;
  showBusinessLicense: boolean;
  requireBusinessLicense: boolean;
  requireLiquorLicense: boolean;
  requireAgeConfirmation: boolean;
};

export const CATEGORY_APPLICATION_CONFIG: Record<string, CategoryApplicationConfig> = {
  [RESTAURANT_SLUG]: {
    title: "Restaurant application",
    subtitle: "Provide your restaurant details for merchant verification and food safety compliance.",
    businessCategory: "restaurant",
    showCuisine: true,
    showFoodPermit: true,
    showBusinessLicense: false,
    requireBusinessLicense: false,
    requireLiquorLicense: false,
    requireAgeConfirmation: false,
  },
  [CONVENIENCE_SLUG]: {
    title: "Convenience store application",
    subtitle: "Tell us about your store so customers can order essentials for delivery or pickup.",
    businessCategory: "convenience_store",
    showCuisine: false,
    showFoodPermit: false,
    showBusinessLicense: true,
    requireBusinessLicense: true,
    requireLiquorLicense: false,
    requireAgeConfirmation: false,
  },
  [LOCAL_RETAIL_SLUG]: {
    title: "Local retail application",
    subtitle: "Share your shop details to join the ZoomEats local retail marketplace.",
    businessCategory: "retail",
    showCuisine: false,
    showFoodPermit: false,
    showBusinessLicense: true,
    requireBusinessLicense: true,
    requireLiquorLicense: false,
    requireAgeConfirmation: false,
  },
  [LIQUOR_SLUG]: {
    title: "Liquor store application",
    subtitle: "Licensed liquor retailers must verify age-restricted delivery compliance before going live.",
    businessCategory: "liquor_store",
    showCuisine: false,
    showFoodPermit: false,
    showBusinessLicense: true,
    requireBusinessLicense: true,
    requireLiquorLicense: true,
    requireAgeConfirmation: true,
  },
  [DISPENSARY_SLUG]: {
    title: "Licensed dispensary application",
    subtitle: "Provide license and business verification for age-restricted cannabis delivery.",
    businessCategory: "pharmacy",
    showCuisine: false,
    showFoodPermit: false,
    showBusinessLicense: true,
    requireBusinessLicense: true,
    requireLiquorLicense: false,
    requireAgeConfirmation: true,
  },
};

export function isPrimarySignupSlug(slug?: string | null): slug is PrimarySignupSlug {
  return PRIMARY_SIGNUP_SLUGS.includes(slug as PrimarySignupSlug);
}

export function categoryApplicationConfig(slug?: string | null): CategoryApplicationConfig {
  return CATEGORY_APPLICATION_CONFIG[slug || RESTAURANT_SLUG] || CATEGORY_APPLICATION_CONFIG[RESTAURANT_SLUG];
}

export function categoryLabel(slug?: string | null): string {
  const labels: Record<string, string> = {
    [RESTAURANT_SLUG]: "Restaurant",
    [CONVENIENCE_SLUG]: "Convenience Store",
    [LOCAL_RETAIL_SLUG]: "Local Retail",
    [LIQUOR_SLUG]: "Liquor Store",
    [DISPENSARY_SLUG]: "Licensed Dispensary",
  };
  return labels[slug || ""] || "Merchant";
}

export function isLiquorCategory(slug?: string | null): boolean {
  return slug === LIQUOR_SLUG;
}

export function isAgeRestrictedCategory(slug?: string | null): boolean {
  return slug === LIQUOR_SLUG || slug === DISPENSARY_SLUG;
}

export function isRetailCategory(slug?: string | null): boolean {
  return slug === LOCAL_RETAIL_SLUG || slug === CONVENIENCE_SLUG || slug === LIQUOR_SLUG;
}
