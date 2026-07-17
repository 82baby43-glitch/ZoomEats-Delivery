-- Universal profiles + vehicle photos (production-compatible)
-- Extends existing driver_vehicles (vehicle_id text PK, mode_key) instead of replacing it.

alter table public.users
  add column if not exists profile_photo_url text,
  add column if not exists thumbnail_photo_url text,
  add column if not exists display_name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists profile_photo_status text not null default 'approved'
    check (profile_photo_status in ('pending', 'approved', 'rejected'));

alter table public.driver_vehicles
  add column if not exists nickname text,
  add column if not exists fuel_type text,
  add column if not exists delivery_capacity text;

insert into public.delivery_mode_definitions (mode_key, label)
values
  ('pickup_truck', 'Pickup Truck'),
  ('motorcycle', 'Motorcycle'),
  ('electric_bike', 'Electric Bike')
on conflict (mode_key) do nothing;

create table if not exists public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text not null references public.driver_vehicles(vehicle_id) on delete cascade,
  photo_url text not null,
  thumbnail_url text,
  photo_type text not null default 'front'
    check (photo_type in ('front', 'rear', 'driver_side', 'passenger_side', 'interior', 'cargo')),
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_vehicle_photos_vehicle
  on public.vehicle_photos (vehicle_id, display_order);

alter table public.vehicle_photos enable row level security;

drop policy if exists "vehicle_photos_own" on public.vehicle_photos;
create policy "vehicle_photos_own"
  on public.vehicle_photos for all
  using (
    exists (
      select 1
      from public.driver_vehicles v
      join public.drivers d on d.driver_id = v.driver_id
      where v.vehicle_id = vehicle_photos.vehicle_id
        and d.user_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
      from public.driver_vehicles v
      join public.drivers d on d.driver_id = v.driver_id
      where v.vehicle_id = vehicle_photos.vehicle_id
        and d.user_id = auth.uid()::text
    )
  );

grant select, insert, update, delete on public.vehicle_photos to authenticated;
grant all on public.vehicle_photos to service_role;

-- Storage buckets
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'profile-images',
    'profile-images',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  );
exception when others then null;
end $$;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'vehicle-images',
    'vehicle-images',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  );
exception when others then null;
end $$;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'restaurant-images',
    'restaurant-images',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  );
exception when others then null;
end $$;
