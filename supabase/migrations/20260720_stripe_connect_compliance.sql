-- Stripe Connect compliance: unified account tracking, payout gating, reverification

create table if not exists public.stripe_connect_accounts (
  account_id text primary key,
  user_id text not null,
  entity_type text not null check (entity_type in ('driver', 'restaurant')),
  entity_ref_id text,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  identity_verified boolean not null default false,
  requires_reverification boolean not null default false,
  disabled_reason text,
  requirements_due jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stripe_connect_user on public.stripe_connect_accounts (user_id);
create index if not exists idx_stripe_connect_entity on public.stripe_connect_accounts (entity_type, entity_ref_id);
create index if not exists idx_stripe_connect_incomplete
  on public.stripe_connect_accounts (requires_reverification, payouts_enabled)
  where payouts_enabled = false or requires_reverification = true;

alter table public.drivers
  add column if not exists stripe_connect_id text,
  add column if not exists stripe_connect_complete boolean not null default false,
  add column if not exists payouts_enabled boolean not null default false,
  add column if not exists identity_verified boolean not null default false,
  add column if not exists requires_reverification boolean not null default false,
  add column if not exists accepting_orders boolean not null default true;

alter table public.restaurants
  add column if not exists stripe_connect_id text,
  add column if not exists stripe_connect_complete boolean not null default false,
  add column if not exists payouts_enabled boolean not null default false,
  add column if not exists identity_verified boolean not null default false,
  add column if not exists requires_reverification boolean not null default false,
  add column if not exists accepting_orders boolean not null default true;

alter table public.stripe_connect_accounts enable row level security;

grant select on public.stripe_connect_accounts to authenticated;
grant all on public.stripe_connect_accounts to service_role;

drop policy if exists "stripe_connect_own" on public.stripe_connect_accounts;
create policy "stripe_connect_own" on public.stripe_connect_accounts
  for select to authenticated using (user_id = auth.uid()::text);
