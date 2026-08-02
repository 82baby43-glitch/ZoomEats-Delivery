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

-- Menu photo enhancement uses the existing menu-images pipeline
-- (restaurant_menu_enhancements + public menu-images bucket).
