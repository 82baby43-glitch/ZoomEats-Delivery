-- Launch readiness: order status transitions, data backfill, driver workload

-- Allow full order lifecycle including Uber Direct and vendor steps
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
  elsif prev = 'pending' and nxt in ('confirmed', 'placed', 'accepted', 'preparing', 'ready', 'assigned_internal', 'assigned_uber', 'picked_up', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'placed' and nxt in ('confirmed', 'accepted', 'preparing', 'ready', 'assigned_internal', 'assigned_uber', 'picked_up', 'delivered', 'failed') then
    return new;
  elsif prev = 'confirmed' and nxt in ('accepted', 'preparing', 'ready', 'assigned_internal', 'assigned_uber', 'picked_up', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'accepted' and nxt in ('preparing', 'ready', 'assigned_internal', 'assigned_uber', 'picked_up', 'delivered', 'failed') then
    return new;
  elsif prev = 'preparing' and nxt in ('ready', 'assigned_internal', 'assigned_uber', 'picked_up', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'ready' and nxt in ('assigned_internal', 'assigned_uber', 'picked_up', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'assigned_internal' and nxt in ('picked_up', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'assigned_uber' and nxt in ('picked_up', 'out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'picked_up' and nxt in ('out_for_delivery', 'delivered', 'failed') then
    return new;
  elsif prev = 'out_for_delivery' and nxt in ('delivered', 'failed') then
    return new;
  else
    raise exception 'Invalid order status transition: % -> %', prev, nxt;
  end if;
end;
$body$;

-- Orders with drivers but stale status
update public.orders
set status = case
  when delivery_type = 'uber' then 'assigned_uber'
  else 'assigned_internal'
end,
updated_at = now()
where driver_id is not null
  and status in ('confirmed', 'placed', 'pending')
  and payment_status = 'paid';

-- Recalculate driver workload from active assignments
update public.drivers d
set workload = coalesce((
  select count(*)::int
  from public.orders o
  where o.driver_id = d.driver_id
    and o.status in ('assigned_internal', 'assigned_uber', 'picked_up', 'out_for_delivery')
), 0),
updated_at = now();

-- Enable approved restaurants for delivery
update public.restaurants
set active = true,
    delivery_enabled = true,
    accepting_orders = true,
    updated_at = now()
where approved = true
  and (active is distinct from true or delivery_enabled is distinct from true or accepting_orders is distinct from true);

-- Cancel orphan test orders (paid but no restaurant)
update public.orders
set status = 'cancelled',
    payment_status = 'failed',
    updated_at = now()
where payment_status = 'paid'
  and restaurant_id is null;
