-- Restaurant partner acquisition: claims workflow + partner status on existing restaurants

alter table public.restaurants
  add column if not exists claimed_by_user_id text references public.users(user_id) on delete set null,
  add column if not exists claim_status text not null default 'none'
    check (claim_status in ('none', 'pending', 'approved', 'rejected')),
  add column if not exists merchant_verified boolean not null default false,
  add column if not exists partner_status text not null default 'unclaimed'
    check (partner_status in ('unclaimed', 'claim_pending', 'verified_partner', 'featured_partner')),
  add column if not exists onboarding_complete boolean not null default false,
  add column if not exists verified_at timestamptz;

create index if not exists idx_restaurants_partner_status
  on public.restaurants (partner_status);

create index if not exists idx_restaurants_claimed_by
  on public.restaurants (claimed_by_user_id)
  where claimed_by_user_id is not null;

-- Backfill existing owned restaurants
update public.restaurants
set
  claimed_by_user_id = coalesce(claimed_by_user_id, owner_id),
  claim_status = case when owner_id is not null and approved then 'approved' when owner_id is not null then 'pending' else claim_status end,
  merchant_verified = case when owner_id is not null and approved then true else merchant_verified end,
  partner_status = case
    when partner_status <> 'unclaimed' then partner_status
    when owner_id is not null and approved then 'verified_partner'
    when owner_id is not null then 'claim_pending'
    else 'unclaimed'
  end,
  verified_at = case when owner_id is not null and approved and verified_at is null then now() else verified_at end
where owner_id is not null;

create table if not exists public.restaurant_claims (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(restaurant_id) on delete cascade,
  user_id text not null references public.users(user_id) on delete cascade,
  owner_name text not null,
  business_email text not null,
  phone text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'rejected')),
  verification_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists idx_restaurant_claims_restaurant
  on public.restaurant_claims (restaurant_id, created_at desc);

create index if not exists idx_restaurant_claims_user
  on public.restaurant_claims (user_id, created_at desc);

create index if not exists idx_restaurant_claims_status
  on public.restaurant_claims (verification_status, created_at desc);

create unique index if not exists idx_restaurant_claims_pending_unique
  on public.restaurant_claims (restaurant_id)
  where verification_status = 'pending';

alter table public.restaurant_claims enable row level security;

drop policy if exists "restaurant_claims_own_read" on public.restaurant_claims;
create policy "restaurant_claims_own_read"
  on public.restaurant_claims for select
  using (user_id = auth.uid()::text);

grant select on public.restaurant_claims to authenticated;
grant all on public.restaurant_claims to service_role;
