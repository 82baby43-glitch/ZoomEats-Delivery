-- ZoomEats: Multi-vehicle driver onboarding & delivery modes (additive)

-- Configurable delivery mode definitions (future-ready)
create table if not exists public.delivery_mode_definitions (
  mode_key text primary key,
  label text not null,
  icon text not null default '🚗',
  vehicle_class text not null default 'motor',
  max_distance_km numeric not null default 50,
  max_weight_lbs numeric not null default 80,
  max_bag_count int not null default 6,
  max_large_drinks int not null default 8,
  requires_license boolean not null default false,
  requires_vehicle_registration boolean not null default false,
  requires_insurance boolean not null default false,
  base_speed_kmh numeric not null default 32,
  sort_order int not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

insert into public.delivery_mode_definitions (mode_key, label, icon, vehicle_class, max_distance_km, max_weight_lbs, max_bag_count, max_large_drinks, requires_license, requires_vehicle_registration, requires_insurance, base_speed_kmh, sort_order)
values
  ('car', 'Car', '🚗', 'motor', 80, 120, 12, 16, true, true, true, 45, 1),
  ('bicycle', 'Bicycle', '🚲', 'human_powered', 8, 25, 4, 4, false, false, false, 18, 2),
  ('scooter', 'Scooter / Moped', '🛵', 'motor', 25, 35, 5, 6, true, true, true, 35, 3),
  ('walking', 'Walking', '🚶', 'foot', 2.5, 12, 2, 2, false, false, false, 5, 4),
  ('suv', 'SUV / Large Vehicle', '🚙', 'motor_large', 100, 200, 20, 24, true, true, true, 42, 5)
on conflict (mode_key) do nothing;

-- Driver approved delivery modes
create table if not exists public.driver_delivery_modes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(user_id) on delete cascade,
  driver_id text references public.drivers(driver_id) on delete set null,
  mode_key text not null references public.delivery_mode_definitions(mode_key),
  approval_status text not null default 'pending',
  approved_at timestamptz,
  approved_by text,
  safety_acknowledged boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mode_key)
);

create index if not exists idx_driver_delivery_modes_driver on public.driver_delivery_modes(driver_id);
create index if not exists idx_driver_delivery_modes_user on public.driver_delivery_modes(user_id);

-- Driver vehicles (car, scooter, suv)
create table if not exists public.driver_vehicles (
  vehicle_id text primary key,
  user_id text not null references public.users(user_id) on delete cascade,
  driver_id text references public.drivers(driver_id) on delete set null,
  mode_key text not null references public.delivery_mode_definitions(mode_key),
  make text,
  model text,
  year int,
  color text,
  license_plate text,
  insurance_expires_at date,
  registration_expires_at date,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_driver_vehicles_user on public.driver_vehicles(user_id);
create index if not exists idx_driver_vehicles_driver on public.driver_vehicles(driver_id);

-- Bicycle profiles
create table if not exists public.driver_bicycle_profiles (
  profile_id text primary key,
  user_id text not null references public.users(user_id) on delete cascade,
  driver_id text references public.drivers(driver_id) on delete set null,
  bike_type text,
  cargo_bag_capacity text,
  is_electric boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_driver_bicycle_profiles_user on public.driver_bicycle_profiles(user_id);

-- Extend drivers with active delivery mode
alter table public.drivers
  add column if not exists active_delivery_mode text references public.delivery_mode_definitions(mode_key),
  add column if not exists active_vehicle_id text references public.driver_vehicles(vehicle_id) on delete set null;

-- Extend driver_onboarding with selected modes
alter table public.driver_onboarding
  add column if not exists selected_delivery_modes jsonb not null default '[]'::jsonb,
  add column if not exists delivery_mode_step_complete boolean not null default false;

-- Order delivery requirements for dispatch eligibility
alter table public.orders
  add column if not exists estimated_weight_lbs numeric,
  add column if not exists bag_count int,
  add column if not exists large_drink_count int,
  add column if not exists delivery_distance_km numeric,
  add column if not exists required_vehicle_class text,
  add column if not exists special_handling text,
  add column if not exists assigned_delivery_mode text;

-- Mode switch + analytics events
create table if not exists public.delivery_mode_events (
  event_id text primary key,
  driver_id text not null,
  user_id text not null,
  from_mode text,
  to_mode text not null,
  order_id text,
  event_type text not null default 'mode_switch',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_mode_events_driver on public.delivery_mode_events(driver_id, created_at desc);
create index if not exists idx_delivery_mode_events_mode on public.delivery_mode_events(to_mode, created_at desc);

-- Grandfather existing drivers to car mode
update public.drivers
set active_delivery_mode = 'car'
where active_delivery_mode is null;

-- RLS
alter table public.delivery_mode_definitions enable row level security;
alter table public.driver_delivery_modes enable row level security;
alter table public.driver_vehicles enable row level security;
alter table public.driver_bicycle_profiles enable row level security;
alter table public.delivery_mode_events enable row level security;

grant select on public.delivery_mode_definitions to authenticated, anon;
grant select, insert, update on public.driver_delivery_modes to authenticated;
grant select, insert, update, delete on public.driver_vehicles to authenticated;
grant select, insert, update on public.driver_bicycle_profiles to authenticated;
grant select, insert on public.delivery_mode_events to authenticated;
grant all on public.delivery_mode_definitions, public.driver_delivery_modes, public.driver_vehicles, public.driver_bicycle_profiles, public.delivery_mode_events to service_role;

drop policy if exists "delivery_mode_defs_read" on public.delivery_mode_definitions;
create policy "delivery_mode_defs_read" on public.delivery_mode_definitions for select using (true);

drop policy if exists "driver_delivery_modes_own" on public.driver_delivery_modes;
create policy "driver_delivery_modes_own" on public.driver_delivery_modes
  for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "driver_vehicles_own" on public.driver_vehicles;
create policy "driver_vehicles_own" on public.driver_vehicles
  for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "driver_bicycle_own" on public.driver_bicycle_profiles;
create policy "driver_bicycle_own" on public.driver_bicycle_profiles
  for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "delivery_mode_events_own" on public.delivery_mode_events;
create policy "delivery_mode_events_own" on public.delivery_mode_events
  for select using (user_id = auth.uid()::text);
create policy "delivery_mode_events_insert_own" on public.delivery_mode_events
  for insert with check (user_id = auth.uid()::text);
