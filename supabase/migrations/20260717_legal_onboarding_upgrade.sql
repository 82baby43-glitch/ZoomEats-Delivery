-- Legal onboarding upgrade: progress tracking, signed agreement documents, extended fields

-- ---- onboarding_progress ----
create table if not exists public.onboarding_progress (
  user_id text not null,
  onboarding_type text not null,
  completed_steps jsonb not null default '[]'::jsonb,
  approval_status text not null default 'incomplete',
  current_step int not null default 1,
  stripe_connect_complete boolean not null default false,
  documents_complete boolean not null default false,
  agreements_complete boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, onboarding_type)
);

create index if not exists idx_onboarding_progress_status
  on public.onboarding_progress (onboarding_type, approval_status);

-- ---- Extend driver_documents for signed agreements ----
alter table public.driver_documents
  add column if not exists signature text,
  add column if not exists signed_at timestamptz,
  add column if not exists agreement_version text,
  add column if not exists document_url text;

-- ---- Extend restaurant_documents for signed agreements ----
alter table public.restaurant_documents
  add column if not exists signature text,
  add column if not exists signed_at timestamptz,
  add column if not exists agreement_version text,
  add column if not exists document_url text;

-- ---- Extend driver_onboarding ----
alter table public.driver_onboarding
  add column if not exists email text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists license_state text,
  add column if not exists insurance_provider text,
  add column if not exists insurance_policy_number text,
  add column if not exists insurance_expiration date,
  add column if not exists bank_verified boolean not null default false;

-- ---- Extend restaurant_onboarding ----
alter table public.restaurant_onboarding
  add column if not exists email text,
  add column if not exists owner_verified boolean not null default false,
  add column if not exists food_permit_required boolean not null default false,
  add column if not exists bank_verified boolean not null default false;

-- ---- RLS for onboarding_progress ----
alter table public.onboarding_progress enable row level security;

grant select, insert, update on public.onboarding_progress to authenticated;
grant all on public.onboarding_progress to service_role;

drop policy if exists "onboarding_progress_own" on public.onboarding_progress;
create policy "onboarding_progress_own" on public.onboarding_progress
  for all to authenticated using (user_id = auth.uid()::text);

-- Seed required legal agreements v2.0 (driver + restaurant)
insert into public.agreement_catalog (agreement_key, major_version, minor_version, role_context, title, body, kind, required) values
  ('independent_contractor_agreement', 2, 0, 'delivery', 'Independent Contractor Agreement',
   'INDEPENDENT CONTRACTOR AGREEMENT. You acknowledge that you are an independent contractor providing delivery services through ZoomEats, not an employee. You control your schedule, provide your own vehicle and equipment, and are solely responsible for taxes, insurance, and business expenses. ZoomEats does not withhold taxes or provide employee benefits.',
   'signature', true),
  ('driver_terms_of_service', 2, 0, 'delivery', 'Driver Terms of Service',
   'DRIVER TERMS OF SERVICE. By signing, you agree to use the ZoomEats platform in compliance with all applicable laws, maintain account security, accept delivery assignments professionally, and refrain from prohibited conduct including fraud, harassment, or misuse of customer data.',
   'signature', true),
  ('safety_agreement', 2, 0, 'delivery', 'Safety Agreement',
   'SAFETY AGREEMENT. You agree to follow all traffic laws, maintain a safe vehicle, use appropriate food handling equipment, report accidents and incidents within 24 hours, and comply with ZoomEats safety standards including no driving under the influence.',
   'signature', true),
  ('background_check_authorization', 2, 0, 'delivery', 'Background Check Authorization',
   'BACKGROUND CHECK AUTHORIZATION. You authorize ZoomEats and its designated background check provider to conduct criminal background checks, motor vehicle record reviews, and identity verification as required for driver eligibility. Results may affect your application status.',
   'signature', true),
  ('data_privacy_agreement', 2, 0, 'delivery', 'Data Privacy Agreement',
   'DATA PRIVACY AGREEMENT. You acknowledge ZoomEats collection and use of your personal data, location data during active deliveries, and delivery activity records in accordance with our Privacy Policy. You agree not to share customer information obtained through the platform.',
   'signature', true),
  ('restaurant_merchant_agreement', 2, 0, 'vendor', 'Restaurant Merchant Agreement',
   'RESTAURANT MERCHANT AGREEMENT. You agree to partner with ZoomEats as a merchant, fulfill orders accurately and promptly, maintain food quality and safety standards, and comply with all applicable health regulations.',
   'signature', true),
  ('platform_terms_of_service', 2, 0, 'vendor', 'Platform Terms of Service',
   'PLATFORM TERMS OF SERVICE. You agree to ZoomEats merchant Terms of Service governing platform use, account management, order fulfillment obligations, and prohibited conduct.',
   'signature', true),
  ('commission_agreement', 2, 0, 'vendor', 'Commission Agreement',
   'COMMISSION AGREEMENT. You agree to platform commission rates, service fees, and fee schedules as published in your merchant dashboard. Rates may be updated with 30 days notice.',
   'signature', true),
  ('payment_processing_agreement', 2, 0, 'vendor', 'Payment Processing Agreement',
   'PAYMENT PROCESSING AGREEMENT. You agree to payout terms via Stripe Connect, accuracy of banking details, payment schedules, and chargeback/dispute resolution procedures.',
   'signature', true),
  ('privacy_agreement', 2, 0, 'vendor', 'Privacy Agreement',
   'PRIVACY AGREEMENT. You acknowledge ZoomEats Privacy Policy for merchant data including customer order information, business records, and payment data handling practices.',
   'signature', true)
on conflict do nothing;
