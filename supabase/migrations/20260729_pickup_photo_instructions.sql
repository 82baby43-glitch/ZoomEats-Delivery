-- Pickup photo instructions — driver + founder intelligence (additive)

create table if not exists public.restaurant_pickup_guides (
  restaurant_id text primary key,
  entrance_instructions text,
  parking_instructions text,
  counter_instructions text,
  shelf_location text,
  pickup_notes text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.pickup_photos (
  photo_id text primary key,
  order_id text not null,
  restaurant_id text not null,
  user_id text not null,
  photo_type text not null check (photo_type in ('entrance', 'parking', 'counter', 'order_bag')),
  storage_path text not null,
  caption text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  status text not null default 'active' check (status in ('uploading', 'active', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists idx_pickup_photos_restaurant on public.pickup_photos (restaurant_id, created_at desc);
create index if not exists idx_pickup_photos_order on public.pickup_photos (order_id, created_at desc);
create index if not exists idx_pickup_photos_user on public.pickup_photos (user_id, created_at desc);

alter table public.restaurant_pickup_guides enable row level security;
alter table public.pickup_photos enable row level security;

create policy pickup_photos_own on public.pickup_photos
  for all using (auth.uid()::text = user_id);

create policy pickup_guides_read on public.restaurant_pickup_guides
  for select using (true);

grant select, insert, update on public.pickup_photos to authenticated;
grant select, insert, update on public.restaurant_pickup_guides to authenticated;
grant all on public.pickup_photos to service_role;
grant all on public.restaurant_pickup_guides to service_role;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('pickup-photos', 'pickup-photos', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic'])
  on conflict (id) do nothing;
exception when others then
  raise notice 'pickup-photos bucket skipped: %', sqlerrm;
end $$;
