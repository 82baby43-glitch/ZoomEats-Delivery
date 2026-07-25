-- Google Places Local Merchant Claim System

alter table public.restaurants
  add column if not exists imported_from_google boolean not null default false,
  add column if not exists business_category text,
  add column if not exists claim_status text not null default 'unclaimed',
  add column if not exists verification_date timestamptz,
  add column if not exists is_local_partner boolean not null default false,
  add column if not exists is_featured_partner boolean not null default false;

create index if not exists idx_restaurants_claim_status
  on public.restaurants (claim_status);

create index if not exists idx_restaurants_business_category
  on public.restaurants (business_category);

comment on column public.restaurants.claim_status is 'unclaimed | claim_requested | pending_verification | verified_local_partner | rejected';
comment on column public.restaurants.business_category is 'restaurant | cafe | food_truck | bakery | convenience_store | liquor_store | grocery_store | pharmacy | retail';

create table if not exists public.business_claim_requests (
  claim_id text primary key,
  restaurant_id text not null references public.restaurants(restaurant_id) on delete cascade,
  google_place_id text,
  user_id text not null references public.users(user_id) on delete cascade,
  status text not null default 'pending_verification',
  merchant_notes text,
  admin_notes text,
  reviewed_by text references public.users(user_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_claim_requests_status
  on public.business_claim_requests (status, created_at desc);

create index if not exists idx_business_claim_requests_user
  on public.business_claim_requests (user_id);

create unique index if not exists idx_business_claim_requests_active_user
  on public.business_claim_requests (user_id)
  where status in ('claim_requested', 'pending_verification');

-- Backfill imported Google listings
update public.restaurants
set
  imported_from_google = true,
  claim_status = case
    when owner_id is not null and approved = true then 'verified_local_partner'
    when owner_id is not null then 'pending_verification'
    else 'unclaimed'
  end,
  is_local_partner = coalesce(is_local_partner, false)
where google_place_id is not null;
