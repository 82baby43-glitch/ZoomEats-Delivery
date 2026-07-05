-- Fix order status transitions for Stripe payment flow (safe to re-run)

alter table public.orders
  add column if not exists order_status text,
  add column if not exists confirmed_at timestamptz;

create or replace function public.set_orders_status_from_payment_status()
returns trigger
language plpgsql
as $body$
begin
  if new.payment_status in ('initiated', 'pending') then
    new.status := 'pending_payment';
  elsif new.payment_status = 'paid' and (old is null or old.payment_status is distinct from 'paid') then
    new.status := 'confirmed';
    new.order_status := coalesce(new.order_status, 'confirmed');
    new.confirmed_at := coalesce(new.confirmed_at, now());
  elsif new.payment_status = 'failed' then
    new.status := 'failed';
  end if;
  return new;
end;
$body$;

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

  if prev = 'pending_payment' and nxt in ('confirmed', 'failed') then
    return new;
  elsif prev = 'pending' and nxt in ('confirmed', 'preparing', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'confirmed' and nxt in ('preparing', 'assigned_internal', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'preparing' and nxt in ('out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'assigned_internal' and nxt in ('picked_up', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'out_for_delivery' and nxt in ('delivered', 'failed') then
    return new;
  elsif nxt = 'failed' then
    return new;
  else
    raise exception 'Invalid order status transition: % -> %', prev, nxt;
  end if;
end;
$body$;

-- Backfill paid orders stuck in pending_payment
update public.orders
set
  status = 'confirmed',
  order_status = coalesce(order_status, 'confirmed'),
  confirmed_at = coalesce(confirmed_at, created_at)
where payment_status = 'paid' and status = 'pending_payment';
