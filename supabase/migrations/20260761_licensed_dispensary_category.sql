-- Licensed Dispensary merchant category + verification fields on restaurant_onboarding

insert into public.merchant_categories (
  category_id, slug, label, icon, color, enabled, visible, custom, sort_order,
  delivery_enabled, pickup_enabled, onboarding_requirements, compliance_settings
) values (
  'cat_dispensary', 'licensed_dispensary', 'Licensed Dispensary', '🌿', '#22C55E', true, true, false, 35,
  true, true,
  '{"requires_business_license":true,"requires_state_license":false,"requires_license_documents":true,"requires_age_restricted_confirmation":true}'::jsonb,
  '{"age_verification":true,"min_age":21,"id_check_on_delivery":true,"restricted_products":true,"audit_logging":true}'::jsonb
)
on conflict (category_id) do update set
  label = excluded.label,
  icon = excluded.icon,
  color = excluded.color,
  enabled = excluded.enabled,
  visible = excluded.visible,
  sort_order = excluded.sort_order,
  onboarding_requirements = excluded.onboarding_requirements,
  compliance_settings = excluded.compliance_settings;

alter table public.restaurant_onboarding
  add column if not exists merchant_category_slug text default 'restaurants',
  add column if not exists business_license_number text,
  add column if not exists state_license_number text,
  add column if not exists license_expiration_date date,
  add column if not exists delivery_agreement_accepted boolean not null default false,
  add column if not exists age_restricted_confirmed boolean not null default false,
  add column if not exists verification_status text not null default 'pending';

comment on column public.restaurant_onboarding.merchant_category_slug is 'Merchant type chosen at signup: restaurants, convenience_stores, local_retail, licensed_dispensary, etc.';
comment on column public.restaurant_onboarding.verification_status is 'pending | documents_submitted | approved | rejected | info_requested';

create index if not exists idx_restaurant_onboarding_category
  on public.restaurant_onboarding (merchant_category_slug);

create index if not exists idx_restaurant_onboarding_verification
  on public.restaurant_onboarding (verification_status);
