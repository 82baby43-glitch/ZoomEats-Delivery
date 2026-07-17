-- Universal account profiles + driver vehicle management

alter table public.users
  add column if not exists profile_photo_url text,
  add column if not exists thumbnail_photo_url text,
  add column if not exists display_name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists profile_photo_status text not null default 'approved'
    check (profile_photo_status in ('pending', 'approved', 'rejected'));

create table if not exists public.driver_vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null references public.drivers(driver_id) on delete cascade,
  nickname text,
  vehicle_type text not null default 'car'
    check (vehicle_type in ('car', 'suv', 'pickup_truck', 'motorcycle', 'scooter', 'bicycle', 'electric_bike', 'walking')),
  make text,
  model text,
  year int,
  color text,
  license_plate text,
  fuel_type text,
  delivery_capacity text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_driver_vehicles_driver
  on public.driver_vehicles (driver_id, is_active desc, created_at desc);

create table if not exists public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.driver_vehicles(id) on delete cascade,
  photo_url text not null,
  thumbnail_url text,
  photo_type text not null default 'front'
    check (photo_type in ('front', 'rear', 'driver_side', 'passenger_side', 'interior', 'cargo')),
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_vehicle_photos_vehicle
  on public.vehicle_photos (vehicle_id, display_order);

alter table public.driver_vehicles enable row level security;
alter table public.vehicle_photos enable row level security;

drop policy if exists "driver_vehicles_own" on public.driver_vehicles;
create policy "driver_vehicles_own"
  on public.driver_vehicles for all
  using (
    exists (
      select 1 from public.drivers d
      where d.driver_id = driver_vehicles.driver_id
        and d.user_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1 from public.drivers d
      where d.driver_id = driver_vehicles.driver_id
        and d.user_id = auth.uid()::text
    )
  );

drop policy if exists "vehicle_photos_own" on public.vehicle_photos;
create policy "vehicle_photos_own"
  on public.vehicle_photos for all
  using (
    exists (
      select 1
      from public.driver_vehicles v
      join public.drivers d on d.driver_id = v.driver_id
      where v.id = vehicle_photos.vehicle_id
        and d.user_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
      from public.driver_vehicles v
      join public.drivers d on d.driver_id = v.driver_id
      where v.id = vehicle_photos.vehicle_id
        and d.user_id = auth.uid()::text
    )
  );

grant select, insert, update, delete on public.driver_vehicles to authenticated;
grant select, insert, update, delete on public.vehicle_photos to authenticated;
grant all on public.driver_vehicles to service_role;
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
