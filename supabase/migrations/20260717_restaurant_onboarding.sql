-- Restaurant onboarding: extended fields, documents gate, Stripe Connect on restaurants

alter table public.restaurant_onboarding
  add column if not exists description text,
  add column if not exists logo_url text,
  add column if not exists owner_email text,
  add column if not exists photos jsonb default '[]'::jsonb,
  add column if not exists menu_draft jsonb default '[]'::jsonb;

alter table public.restaurants
  add column if not exists documents_complete boolean not null default false,
  add column if not exists stripe_connect_id text,
  add column if not exists stripe_connect_complete boolean not null default false;

-- Menu photo enhancement drafts (original + enhanced URLs)
create table if not exists public.menu_photo_enhancements (
  enhancement_id text primary key,
  restaurant_id text not null,
  user_id text not null,
  original_path text not null,
  enhanced_path text,
  status text not null default 'pending',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_menu_photo_enhancements_restaurant
  on public.menu_photo_enhancements (restaurant_id, created_at desc);

alter table public.menu_photo_enhancements enable row level security;

grant select, insert, update on public.menu_photo_enhancements to authenticated;
grant all on public.menu_photo_enhancements to service_role;

drop policy if exists "menu_enhancements_own" on public.menu_photo_enhancements;
create policy "menu_enhancements_own" on public.menu_photo_enhancements
  for all to authenticated using (user_id = auth.uid()::text);
