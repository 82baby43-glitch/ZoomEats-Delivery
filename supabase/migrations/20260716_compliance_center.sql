-- Production compliance: agreement versioning, onboarding, tax, background checks, storage

-- ---- Agreement catalog (versioned) ----
create table if not exists public.agreement_catalog (
  agreement_key text not null,
  major_version int not null default 1,
  minor_version int not null default 0,
  role_context text not null,
  title text not null,
  body text not null,
  kind text not null default 'signature',
  required boolean not null default true,
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  change_log text,
  language text not null default 'en',
  primary key (agreement_key, major_version, minor_version)
);

create index if not exists idx_agreement_catalog_active
  on public.agreement_catalog (role_context, effective_at desc)
  where retired_at is null;

-- Seed driver agreements v1.0
insert into public.agreement_catalog (agreement_key, major_version, minor_version, role_context, title, body, kind, required) values
  ('driver_service_agreement', 1, 0, 'delivery', 'Driver Service Agreement', 'You agree to provide delivery services through ZoomEats in accordance with platform standards.', 'signature', true),
  ('independent_contractor_agreement', 1, 0, 'delivery', 'Independent Contractor Agreement', 'You acknowledge you are an independent contractor, not an employee of ZoomEats.', 'signature', true),
  ('terms_of_service', 1, 0, 'delivery', 'Terms of Service', 'You agree to ZoomEats Terms of Service.', 'signature', true),
  ('privacy_policy', 1, 0, 'delivery', 'Privacy Policy', 'You acknowledge ZoomEats Privacy Policy.', 'signature', true),
  ('community_guidelines', 1, 0, 'delivery', 'Community Guidelines', 'You agree to community standards.', 'signature', true),
  ('safety_policy', 1, 0, 'delivery', 'Safety Policy', 'You agree to safe driving practices.', 'signature', true),
  ('background_check_consent', 1, 0, 'delivery', 'Background Check Consent', 'You consent to background and MVR checks.', 'signature', true),
  ('electronic_signature_consent', 1, 0, 'delivery', 'Electronic Signature Consent', 'You consent to electronic signatures.', 'signature', true),
  ('mvr_consent', 1, 0, 'delivery', 'Motor Vehicle Record Consent', 'You consent to motor vehicle record review.', 'signature', true),
  ('food_delivery_safety', 1, 0, 'delivery', 'Food Delivery Safety', 'Food handling, privacy, safe driving, no harassment, alcohol policy.', 'signature', true),
  ('driver_code_of_conduct', 1, 0, 'delivery', 'Driver Code of Conduct', 'Professional conduct standards for drivers.', 'signature', true),
  ('insurance_confirmation', 1, 0, 'delivery', 'Insurance Confirmation', 'I maintain required insurance.', 'checkbox', true),
  ('vehicle_compliance', 1, 0, 'delivery', 'Vehicle Compliance', 'My vehicle meets requirements.', 'checkbox', true),
  ('tax_acknowledgement', 1, 0, 'delivery', 'Tax Acknowledgement', 'I am responsible for my own taxes.', 'checkbox', true)
on conflict do nothing;

insert into public.agreement_catalog (agreement_key, major_version, minor_version, role_context, title, body, kind, required) values
  ('merchant_agreement', 1, 0, 'vendor', 'Merchant Agreement', 'Partner with ZoomEats as a merchant.', 'signature', true),
  ('terms_of_service', 1, 0, 'vendor', 'Terms of Service', 'Merchant Terms of Service.', 'signature', true),
  ('privacy_policy', 1, 0, 'vendor', 'Privacy Policy', 'Merchant Privacy Policy.', 'signature', true),
  ('refund_policy', 1, 0, 'vendor', 'Refund Policy', 'Refund and resolution policies.', 'signature', true),
  ('commission_agreement', 1, 0, 'vendor', 'Commission Agreement', 'Platform commission rates.', 'signature', true),
  ('payment_agreement', 1, 0, 'vendor', 'Payment Agreement', 'Payout terms and schedules.', 'signature', true),
  ('food_safety_certification', 1, 0, 'vendor', 'Food Safety Certification', 'Food safety compliance.', 'signature', true),
  ('tax_responsibility', 1, 0, 'vendor', 'Tax Responsibility', 'Sales tax and permits.', 'signature', true),
  ('menu_accuracy_policy', 1, 0, 'vendor', 'Menu Accuracy Policy', 'Accurate menu items and prices.', 'signature', true),
  ('electronic_signature', 1, 0, 'vendor', 'Electronic Signature', 'Electronic signature consent.', 'signature', true)
on conflict do nothing;

insert into public.agreement_catalog (agreement_key, major_version, minor_version, role_context, title, body, kind, required) values
  ('terms_of_service', 1, 0, 'customer', 'Terms of Service', 'Customer Terms of Service.', 'signature', true),
  ('privacy_policy', 1, 0, 'customer', 'Privacy Policy', 'Customer Privacy Policy.', 'signature', true),
  ('electronic_communications', 1, 0, 'customer', 'Electronic Communications', 'Consent to electronic communications.', 'signature', true),
  ('refund_policy', 1, 0, 'customer', 'Refund Policy', 'Order refund policy.', 'signature', true),
  ('cancellation_policy', 1, 0, 'customer', 'Cancellation Policy', 'Order cancellation policy.', 'signature', true),
  ('community_guidelines', 1, 0, 'customer', 'Community Guidelines', 'Community standards.', 'signature', true)
on conflict do nothing;

-- ---- Driver onboarding progress ----
create table if not exists public.driver_onboarding (
  user_id text primary key,
  current_step int not null default 1,
  status text not null default 'incomplete',
  legal_name text,
  date_of_birth date,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  phone text,
  license_number text,
  license_expiration date,
  vehicle_make text,
  vehicle_model text,
  vehicle_year int,
  vehicle_color text,
  vehicle_plate text,
  stripe_connect_id text,
  stripe_connect_complete boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---- Restaurant onboarding progress ----
create table if not exists public.restaurant_onboarding (
  user_id text primary key,
  restaurant_id text,
  current_step int not null default 1,
  status text not null default 'submitted',
  business_name text,
  owner_name text,
  business_address text,
  phone text,
  hours jsonb,
  cuisine text,
  sales_tax_id text,
  ein text,
  stripe_connect_id text,
  stripe_connect_complete boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---- Tax information (encrypted payload — service role only) ----
create table if not exists public.tax_information (
  tax_id text primary key,
  user_id text not null,
  entity_type text not null,
  legal_name text not null,
  business_name text,
  tax_classification text,
  address_line1 text,
  city text,
  state text,
  zip text,
  encrypted_payload text not null,
  last_four text,
  w9_signed_at timestamptz,
  w9_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_tax_information_user on public.tax_information (user_id);

-- ---- Background checks ----
create table if not exists public.background_checks (
  check_id text primary key,
  user_id text not null,
  provider text default 'manual',
  status text not null default 'pending',
  mvr_status text default 'pending',
  result_summary text,
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  reviewed_by text,
  notes text
);

create index if not exists idx_background_checks_user on public.background_checks (user_id);

-- ---- Extend driver_documents ----
alter table public.driver_documents
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists content_type text,
  add column if not exists expires_at date,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.restaurant_documents
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists content_type text,
  add column if not exists expires_at date,
  add column if not exists metadata jsonb default '{}'::jsonb;

-- ---- Compliance notifications ----
create table if not exists public.compliance_notifications (
  notification_id text primary key,
  user_id text not null,
  channel text not null default 'in_app',
  event_type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_compliance_notifications_user
  on public.compliance_notifications (user_id, created_at desc);

-- ---- RLS ----
alter table public.agreement_catalog enable row level security;
alter table public.driver_onboarding enable row level security;
alter table public.restaurant_onboarding enable row level security;
alter table public.tax_information enable row level security;
alter table public.background_checks enable row level security;
alter table public.compliance_notifications enable row level security;

grant select on public.agreement_catalog to authenticated, anon;
grant select, insert, update on public.driver_onboarding to authenticated;
grant select, insert, update on public.restaurant_onboarding to authenticated;
grant select, insert, update on public.compliance_notifications to authenticated;
grant all on public.agreement_catalog to service_role;
grant all on public.driver_onboarding to service_role;
grant all on public.restaurant_onboarding to service_role;
grant all on public.tax_information to service_role;
grant all on public.background_checks to service_role;
grant all on public.compliance_notifications to service_role;

drop policy if exists "agreement_catalog_read" on public.agreement_catalog;
create policy "agreement_catalog_read" on public.agreement_catalog
  for select to authenticated, anon using (retired_at is null);

drop policy if exists "driver_onboarding_own" on public.driver_onboarding;
create policy "driver_onboarding_own" on public.driver_onboarding
  for all to authenticated using (user_id = auth.uid()::text);

drop policy if exists "restaurant_onboarding_own" on public.restaurant_onboarding;
create policy "restaurant_onboarding_own" on public.restaurant_onboarding
  for all to authenticated using (user_id = auth.uid()::text);

drop policy if exists "compliance_notifications_own" on public.compliance_notifications;
create policy "compliance_notifications_own" on public.compliance_notifications
  for all to authenticated using (user_id = auth.uid()::text);

-- tax_information and background_checks: service_role / admin API only (no client RLS)

-- Storage bucket (skip if storage schema unavailable)
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('compliance-documents', 'compliance-documents', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
  on conflict (id) do nothing;
exception when others then
  raise notice 'storage bucket skipped: %', sqlerrm;
end $$;
