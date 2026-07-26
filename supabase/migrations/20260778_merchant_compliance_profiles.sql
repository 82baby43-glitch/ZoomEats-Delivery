-- Merchant compliance profiles for regulated marketplace merchants (Licensed Dispensary)

create table if not exists public.merchant_compliance_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references public.restaurants(restaurant_id) on delete cascade,
  merchant_category text not null default 'licensed_dispensary',
  license_number text,
  license_expiration date,
  verification_status text not null default 'pending',
  fulfillment_type text,
  business_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_compliance_profiles_merchant_id_key unique (merchant_id),
  constraint merchant_compliance_profiles_verification_status_check
    check (verification_status in ('pending', 'approved', 'rejected', 'suspended', 'documents_submitted', 'info_requested')),
  constraint merchant_compliance_profiles_fulfillment_type_check
    check (
      fulfillment_type is null
      or fulfillment_type in ('merchant_managed', 'third_party_transport', 'integrated_logistics')
    )
);

create index if not exists idx_merchant_compliance_profiles_category
  on public.merchant_compliance_profiles (merchant_category);

create index if not exists idx_merchant_compliance_profiles_verification
  on public.merchant_compliance_profiles (verification_status);

comment on table public.merchant_compliance_profiles is
  'Regulated merchant compliance data. ZoomEats is marketplace software — merchants retain licensing responsibility.';

alter table public.restaurant_onboarding
  add column if not exists licensing_responsibility_confirmed boolean not null default false;

comment on column public.restaurant_onboarding.licensing_responsibility_confirmed is
  'Merchant confirms they maintain required licenses; ZoomEats provides technology only.';

-- Backfill compliance profiles for existing licensed dispensary restaurants
insert into public.merchant_compliance_profiles (
  merchant_id,
  merchant_category,
  license_number,
  license_expiration,
  verification_status,
  business_address,
  created_at,
  updated_at
)
select
  r.restaurant_id,
  coalesce(r.merchant_category_slug, o.merchant_category_slug, 'licensed_dispensary'),
  coalesce(o.business_license_number, o.state_license_number),
  o.license_expiration_date,
  case
    when o.verification_status in ('approved', 'rejected', 'suspended', 'documents_submitted', 'info_requested')
      then o.verification_status
    when r.approved then 'approved'
    else 'pending'
  end,
  coalesce(o.business_address, r.address),
  coalesce(r.created_at, now()),
  now()
from public.restaurants r
left join public.restaurant_onboarding o on o.user_id = r.owner_id
where coalesce(r.merchant_category_slug, o.merchant_category_slug) = 'licensed_dispensary'
on conflict (merchant_id) do nothing;

-- Update licensed dispensary category marketplace positioning
update public.merchant_categories
set
  label = 'Licensed Dispensary',
  onboarding_requirements = jsonb_build_object(
    'merchant_type', 'Licensed Cannabis Retailer',
    'platform_role', 'Marketplace Software Partner',
    'description', 'ZoomEats provides licensed merchants with marketplace software, digital ordering tools, merchant management systems, and logistics coordination technology. Merchants remain responsible for their own licenses, inventory compliance, and regulatory operations.',
    'requires_business_license', true,
    'requires_state_license', true,
    'requires_license_documents', true,
    'requires_age_restricted_confirmation', true,
    'requires_licensing_acknowledgment', true
  ),
  compliance_settings = jsonb_build_object(
    'age_verification', true,
    'min_age', 21,
    'id_check_on_delivery', true,
    'restricted_products', true,
    'audit_logging', true,
    'marketplace_software_only', true,
    'verified_badge', 'Verified Marketplace Merchant'
  )
where slug = 'licensed_dispensary';

alter table public.merchant_compliance_profiles enable row level security;

create policy merchant_compliance_profiles_vendor_read on public.merchant_compliance_profiles
  for select
  using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = merchant_compliance_profiles.merchant_id
        and r.owner_id = auth.uid()::text
    )
  );

create policy merchant_compliance_profiles_vendor_update on public.merchant_compliance_profiles
  for update
  using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = merchant_compliance_profiles.merchant_id
        and r.owner_id = auth.uid()::text
    )
  );

create policy merchant_compliance_profiles_admin_all on public.merchant_compliance_profiles
  for all
  using (
    exists (
      select 1 from public.users u
      where u.user_id = auth.uid()::text and u.role = 'admin'
    )
  );
