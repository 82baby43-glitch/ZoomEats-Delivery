-- Logistics intelligence: per-order timing metrics for ETA / dispatch / prep ML training

create table if not exists public.delivery_metrics (
  id bigserial primary key,
  order_id text not null references public.orders(order_id) on delete cascade,
  restaurant_prepare_time numeric not null default 0,
  driver_wait_time numeric not null default 0,
  pickup_duration numeric not null default 0,
  travel_time numeric not null default 0,
  total_delivery_time numeric not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_delivery_metrics_order on public.delivery_metrics (order_id);
create index if not exists idx_delivery_metrics_created on public.delivery_metrics (created_at desc);

alter table public.delivery_metrics enable row level security;

drop policy if exists "customers_read_own_delivery_metrics" on public.delivery_metrics;
create policy "customers_read_own_delivery_metrics" on public.delivery_metrics
  for select using (
    order_id in (select order_id from public.orders where customer_id = auth.uid())
  );

drop policy if exists "restaurants_read_delivery_metrics" on public.delivery_metrics;
create policy "restaurants_read_delivery_metrics" on public.delivery_metrics
  for select using (
    order_id in (
      select o.order_id
      from public.orders o
      join public.restaurants r on r.restaurant_id = o.restaurant_id
      where r.owner_id = auth.uid()
    )
  );

grant select on public.delivery_metrics to authenticated;
grant all on public.delivery_metrics to service_role;
