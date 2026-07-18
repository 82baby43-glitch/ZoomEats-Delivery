export type MerchantCategory = {
  category_id: string;
  slug: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  visible: boolean;
  custom: boolean;
  sort_order: number;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  onboarding_requirements: Record<string, unknown>;
  compliance_settings: Record<string, unknown>;
  product_field_config: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type MarketplaceSearchResult = {
  query: string;
  merchants: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  categories: MerchantCategory[];
};
