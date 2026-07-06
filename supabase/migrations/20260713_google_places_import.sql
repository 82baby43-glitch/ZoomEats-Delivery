-- Google Places bulk import — safe additive migration (non-breaking)

alter table public.restaurants
  add column if not exists google_place_id text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists total_reviews integer,
  add column if not exists price_level smallint,
  add column if not exists business_status text,
  add column if not exists opening_hours jsonb,
  add column if not exists primary_category text,
  add column if not exists google_photo_reference text,
  add column if not exists delivery_enabled boolean default false,
  add column if not exists active boolean default false,
  add column if not exists state text,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_restaurants_google_place_id
  on public.restaurants (google_place_id)
  where google_place_id is not null;

create index if not exists idx_restaurants_city_state
  on public.restaurants (state)
  where state is not null;

create table if not exists public.restaurant_import_logs (
  import_id text primary key,
  user_id text not null,
  city text not null,
  state text,
  radius_meters integer not null default 15000,
  limit_requested integer not null default 100,
  found_count integer not null default 0,
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'pending',
  progress_pct numeric not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_restaurant_import_logs_created
  on public.restaurant_import_logs (created_at desc);

alter table public.restaurant_import_logs enable row level security;

grant all on public.restaurant_import_logs to service_role;
