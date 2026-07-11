-- Intelligent delivery workflow: preferences, verification, GPS proof, timeline events

-- Delivery preference + verification columns on orders
alter table public.orders
  add column if not exists delivery_method text default 'hand_to_me',
  add column if not exists delivery_instructions text,
  add column if not exists require_delivery_pin boolean default false,
  add column if not exists allow_photo_confirmation boolean default true,
  add column if not exists driver_arrived_at timestamptz,
  add column if not exists restaurant_ready_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists customer_arrived_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_verification_code text,
  add column if not exists delivery_verification_code_hash text,
  add column if not exists verification_attempts int default 0,
  add column if not exists verification_success boolean default false,
  add column if not exists delivery_photo_url text,
  add column if not exists delivery_photo_timestamp timestamptz,
  add column if not exists delivery_gps_lat double precision,
  add column if not exists delivery_gps_lng double precision,
  add column if not exists gps_verified boolean default false,
  add column if not exists route_distance double precision,
  add column if not exists delivery_duration int,
  add column if not exists delivery_note text;

comment on column public.orders.delivery_method is 'leave_at_door | hand_to_me';
comment on column public.orders.delivery_verification_code is 'One-time 6-digit PIN for customer display; cleared after delivery';
comment on column public.orders.delivery_verification_code_hash is 'SHA-256 hash of one-time PIN; never expose to drivers';

-- Delivery milestone timeline (admin + audit)
create table if not exists public.delivery_events (
  event_id text primary key,
  order_id text not null references public.orders(order_id) on delete cascade,
  event_type text not null,
  actor_role text,
  actor_id text,
  message text,
  meta jsonb default '{}'::jsonb,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create index if not exists delivery_events_order_id_idx on public.delivery_events(order_id, created_at);

-- Delivery proof photos (contactless / leave at door)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-photos',
  'delivery-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Extend order status transitions for intelligent delivery workflow
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
as $body$
declare
  prev text := old.status;
  nxt text := new.status;
begin
  if prev is null or nxt is null or prev = nxt then
    return new;
  end if;

  if nxt = 'failed' or nxt = 'cancelled' then
    return new;
  end if;

  if prev = 'pending_payment' and nxt in ('confirmed', 'placed', 'failed') then
    return new;
  elsif prev = 'pending' and nxt in ('confirmed', 'placed', 'accepted', 'preparing', 'ready', 'assigned_internal', 'assigned_uber', 'arrived_at_store', 'picked_up', 'out_for_delivery', 'arrived_at_customer', 'delivered', 'failed') then
    return new;
  elsif prev = 'placed' and nxt in ('confirmed', 'accepted', 'preparing', 'ready', 'assigned_internal', 'assigned_uber', 'arrived_at_store', 'picked_up', 'arrived_at_customer', 'delivered', 'failed') then
    return new;
  elsif prev = 'confirmed' and nxt in ('accepted', 'preparing', 'ready', 'assigned_internal', 'assigned_uber', 'arrived_at_store', 'picked_up', 'out_for_delivery', 'arrived_at_customer', 'delivered', 'failed') then
    return new;
  elsif prev = 'accepted' and nxt in ('preparing', 'ready', 'assigned_internal', 'assigned_uber', 'arrived_at_store', 'picked_up', 'arrived_at_customer', 'delivered', 'failed') then
    return new;
  elsif prev = 'preparing' and nxt in ('ready', 'assigned_internal', 'assigned_uber', 'arrived_at_store', 'picked_up', 'out_for_delivery', 'arrived_at_customer', 'delivered', 'failed') then
    return new;
  elsif prev = 'ready' and nxt in ('assigned_internal', 'assigned_uber', 'arrived_at_store', 'picked_up', 'out_for_delivery', 'arrived_at_customer', 'delivered', 'failed') then
    return new;
  elsif prev = 'assigned_internal' and nxt in ('arrived_at_store', 'picked_up', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'assigned_uber' and nxt in ('arrived_at_store', 'picked_up', 'out_for_delivery', 'arrived_at_customer', 'delivered', 'failed') then
    return new;
  elsif prev = 'arrived_at_store' and nxt in ('picked_up', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'picked_up' and nxt in ('out_for_delivery', 'arrived_at_customer', 'delivered', 'failed') then
    return new;
  elsif prev = 'out_for_delivery' and nxt in ('arrived_at_customer', 'delivered', 'failed') then
    return new;
  elsif prev = 'arrived_at_customer' and nxt in ('delivered', 'failed') then
    return new;
  else
    raise exception 'Invalid order status transition: % -> %', prev, nxt;
  end if;
end;
$body$;

-- Backfill ready timestamp where applicable
update public.orders
set restaurant_ready_at = coalesce(restaurant_ready_at, updated_at)
where status in ('ready', 'assigned_internal', 'arrived_at_store', 'picked_up', 'out_for_delivery', 'arrived_at_customer', 'delivered')
  and restaurant_ready_at is null;

update public.orders
set delivered_at = coalesce(delivered_at, updated_at)
where status = 'delivered'
  and delivered_at is null;

-- Realtime for delivery events
alter publication supabase_realtime add table public.delivery_events;
