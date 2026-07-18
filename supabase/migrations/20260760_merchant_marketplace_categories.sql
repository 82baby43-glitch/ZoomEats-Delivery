-- Universal Local Marketplace Framework v1.0
-- Configurable merchant categories; restaurants table remains the merchant store.

create table if not exists public.merchant_categories (
  category_id text primary key,
  slug text not null unique,
  label text not null,
  icon text not null default '🏪',
  color text not null default '#B6F127',
  enabled boolean not null default false,
  visible boolean not null default true,
  custom boolean not null default false,
  sort_order int not null default 100,
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  onboarding_requirements jsonb not null default '{}'::jsonb,
  compliance_settings jsonb not null default '{}'::jsonb,
  product_field_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.merchant_categories is 'Admin-configurable marketplace merchant categories';
comment on column public.merchant_categories.compliance_settings is 'Per-category compliance: age_verification, restricted_products, id_check_on_delivery, etc.';

alter table public.restaurants
  add column if not exists merchant_category_slug text;

update public.restaurants
set merchant_category_slug = 'restaurants'
where merchant_category_slug is null or trim(merchant_category_slug) = '';

alter table public.restaurants
  alter column merchant_category_slug set default 'restaurants';

create index if not exists idx_restaurants_merchant_category_slug
  on public.restaurants (merchant_category_slug);

-- Universal product catalog fields (backward compatible — all nullable/defaulted)
alter table public.menu_items
  add column if not exists sku text,
  add column if not exists barcode text,
  add column if not exists weight_grams numeric,
  add column if not exists tax_category text,
  add column if not exists product_category text,
  add column if not exists featured boolean not null default false,
  add column if not exists inventory_count int,
  add column if not exists brand text;

create index if not exists idx_menu_items_sku on public.menu_items (sku) where sku is not null;
create index if not exists idx_menu_items_product_category on public.menu_items (product_category) where product_category is not null;
create index if not exists idx_menu_items_featured on public.menu_items (restaurant_id, featured) where featured = true;

-- Customer merchant favorites (framework)
create table if not exists public.merchant_favorites (
  favorite_id text primary key,
  user_id text not null references public.users(user_id) on delete cascade,
  restaurant_id text not null references public.restaurants(restaurant_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, restaurant_id)
);

create index if not exists idx_merchant_favorites_user on public.merchant_favorites (user_id, created_at desc);

-- Seed built-in categories (idempotent)
insert into public.merchant_categories (
  category_id, slug, label, icon, color, enabled, visible, custom, sort_order,
  delivery_enabled, pickup_enabled, onboarding_requirements, compliance_settings
) values
  ('cat_restaurants', 'restaurants', 'Restaurants', '🍔', '#B6F127', true, true, false, 10, true, true,
    '{"requires_food_permit":true,"requires_menu":true}'::jsonb, '{}'::jsonb),
  ('cat_convenience', 'convenience_stores', 'Convenience Stores', '🛒', '#60A5FA', true, true, false, 20, true, true,
    '{"requires_business_license":true}'::jsonb, '{}'::jsonb),
  ('cat_local_retail', 'local_retail', 'Local Retail', '🏪', '#F472B6', true, true, false, 30, true, true,
    '{"requires_business_license":true}'::jsonb, '{}'::jsonb),
  ('cat_grocery', 'grocery_stores', 'Grocery Stores', '🥬', '#34D399', false, true, false, 40, true, true,
    '{"requires_business_license":true}'::jsonb, '{}'::jsonb),
  ('cat_bakery', 'bakeries', 'Bakeries', '🥐', '#FBBF24', false, true, false, 50, true, true,
    '{"requires_food_permit":true}'::jsonb, '{}'::jsonb),
  ('cat_coffee', 'coffee_shops', 'Coffee Shops', '☕', '#A78BFA', false, true, false, 60, true, true,
    '{"requires_food_permit":false}'::jsonb, '{}'::jsonb),
  ('cat_liquor', 'liquor_stores', 'Liquor Stores', '🍷', '#EF4444', false, false, false, 70, true, false,
    '{"requires_liquor_license":true}'::jsonb,
    '{"age_verification":true,"min_age":21,"id_check_on_delivery":true,"restricted_products":true}'::jsonb),
  ('cat_florist', 'florists', 'Florists', '🌸', '#EC4899', false, true, false, 80, true, true,
    '{}'::jsonb, '{}'::jsonb),
  ('cat_pet', 'pet_supply_stores', 'Pet Supply Stores', '🐶', '#F59E0B', false, true, false, 90, true, true,
    '{}'::jsonb, '{}'::jsonb),
  ('cat_gift', 'gift_shops', 'Gift Shops', '🎁', '#8B5CF6', false, true, false, 100, true, true,
    '{}'::jsonb, '{}'::jsonb),
  ('cat_office', 'office_supply_stores', 'Office Supply Stores', '📎', '#64748B', false, true, false, 110, true, true,
    '{}'::jsonb, '{}'::jsonb),
  ('cat_electronics', 'electronics_stores', 'Electronics Stores', '📱', '#06B6D4', false, true, false, 120, true, true,
    '{}'::jsonb, '{}'::jsonb),
  ('cat_farmers', 'farmers_markets', 'Farmers Markets', '🌽', '#84CC16', false, true, false, 130, true, true,
    '{}'::jsonb, '{}'::jsonb),
  ('cat_specialty_food', 'specialty_food_stores', 'Specialty Food Stores', '🧀', '#FB923C', false, true, false, 140, true, true,
    '{"requires_food_permit":true}'::jsonb, '{}'::jsonb),
  ('cat_health', 'health_wellness_stores', 'Health & Wellness Stores', '💊', '#10B981', false, true, false, 150, true, true,
    '{}'::jsonb, '{"restricted_products":true}'::jsonb),
  ('cat_home', 'home_essentials', 'Home Essentials', '🏠', '#0EA5E9', false, true, false, 160, true, true,
    '{}'::jsonb, '{}'::jsonb),
  ('cat_beauty', 'beauty_supply_stores', 'Beauty Supply Stores', '💄', '#E879F9', false, true, false, 170, true, true,
    '{}'::jsonb, '{}'::jsonb),
  ('cat_boutique', 'local_boutiques', 'Local Boutiques', '👗', '#D946EF', false, true, false, 180, true, true,
    '{}'::jsonb, '{}'::jsonb)
on conflict (category_id) do update set
  label = excluded.label,
  icon = excluded.icon,
  color = excluded.color,
  sort_order = excluded.sort_order,
  onboarding_requirements = excluded.onboarding_requirements,
  compliance_settings = excluded.compliance_settings;

-- RLS
alter table public.merchant_categories enable row level security;
alter table public.merchant_favorites enable row level security;

grant select on public.merchant_categories to anon, authenticated;
grant all on public.merchant_categories to service_role;
grant select, insert, delete on public.merchant_favorites to authenticated;
grant all on public.merchant_favorites to service_role;

drop policy if exists "merchant_categories_public_read" on public.merchant_categories;
create policy "merchant_categories_public_read" on public.merchant_categories
  for select to anon, authenticated using (visible = true);

drop policy if exists "merchant_favorites_own" on public.merchant_favorites;
create policy "merchant_favorites_own" on public.merchant_favorites
  for all to authenticated using (user_id = auth.uid()::text);
