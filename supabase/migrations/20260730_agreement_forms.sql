-- Agreement forms, e-signatures, and driver background check disclosures

alter table public.agreement_acceptances
  add column if not exists signature_image text;

create table if not exists public.driver_background_disclosures (
  disclosure_id text primary key,
  user_id text not null unique,
  legal_name text not null,
  date_of_birth date,
  address_line1 text,
  city text,
  state text,
  zip text,
  phone text,
  license_number text,
  license_state text,
  has_criminal_history boolean not null default false,
  offenses jsonb not null default '[]'::jsonb,
  fcra_authorization boolean not null default false,
  mvr_authorization boolean not null default false,
  disclosure_signature text,
  signature_image text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_driver_background_disclosures_user on public.driver_background_disclosures (user_id);

alter table public.background_checks
  add column if not exists disclosure_id text,
  add column if not exists form_payload jsonb default '{}'::jsonb;

alter table public.driver_background_disclosures enable row level security;

create policy driver_background_disclosures_own on public.driver_background_disclosures
  for all using (auth.uid()::text = user_id);

grant select, insert, update on public.driver_background_disclosures to authenticated;
alter table public.driver_onboarding
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

alter table public.restaurant_onboarding
  add column if not exists food_permit_number text,
  add column if not exists metadata jsonb default '{}'::jsonb;
