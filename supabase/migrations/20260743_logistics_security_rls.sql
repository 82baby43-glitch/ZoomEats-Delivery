-- Logistics Intelligence Engine — role-based security (section 11)
-- Drivers: own location only | Customers: active assigned delivery | Restaurants: assigned driver | Admins: full

-- =============================================================================
-- Helpers
-- =============================================================================

create or replace function public.logistics_active_order_statuses()
returns text[]
language sql
immutable
as $$
  select array[
    'ready',
    'assigned_internal',
    'assigned_uber',
    'picked_up',
    'out_for_delivery'
  ]::text[];
$$;

create or replace function public.is_logistics_driver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.drivers d
    where d.user_id = auth.uid()::text
       or exists (
         select 1 from public.users u
         where u.user_id = d.user_id and u.auth_id = auth.uid()
       )
  )
  or exists (
    select 1 from public.users u
    where (u.user_id = auth.uid()::text or u.auth_id = auth.uid())
      and u.role in ('delivery', 'admin')
  );
$$;

create or replace function public.is_logistics_restaurant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurants r
    where r.owner_id = auth.uid()::text
  )
  or exists (
    select 1 from public.users u
    where (u.user_id = auth.uid()::text or u.auth_id = auth.uid())
      and u.role = 'vendor'
  );
$$;

create or replace function public.is_own_logistics_driver(target_driver_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.drivers d
    where d.driver_id = target_driver_id
      and (
        d.user_id = auth.uid()::text
        or exists (
          select 1 from public.users u
          where u.user_id = d.user_id and u.auth_id = auth.uid()
        )
      )
  );
$$;

/** Customer may view live logistics only for their in-progress assigned delivery. */
create or replace function public.is_customer_active_delivery(target_order_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    where o.order_id = target_order_id
      and o.customer_id = auth.uid()::text
      and o.driver_id is not null
      and o.status = any(public.logistics_active_order_statuses())
  );
$$;

/** Restaurant may view driver logistics for active orders at their store. */
create or replace function public.is_restaurant_assigned_delivery(target_order_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    join public.restaurants r on r.restaurant_id = o.restaurant_id
    where o.order_id = target_order_id
      and r.owner_id = auth.uid()::text
      and o.driver_id is not null
      and o.status = any(public.logistics_active_order_statuses())
  );
$$;

create or replace function public.is_restaurant_assigned_driver(target_driver_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    join public.restaurants r on r.restaurant_id = o.restaurant_id
    where o.driver_id = target_driver_id
      and r.owner_id = auth.uid()::text
      and o.status = any(public.logistics_active_order_statuses())
  );
$$;

create or replace function public.is_customer_order(target_order_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    where o.order_id = target_order_id
      and o.customer_id = auth.uid()::text
  );
$$;

create or replace function public.is_restaurant_order(target_order_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    join public.restaurants r on r.restaurant_id = o.restaurant_id
    where o.order_id = target_order_id
      and r.owner_id = auth.uid()::text
  );
$$;

revoke all on function public.logistics_active_order_statuses() from public;
revoke all on function public.is_logistics_driver() from public;
revoke all on function public.is_logistics_restaurant() from public;
revoke all on function public.is_own_logistics_driver(text) from public;
revoke all on function public.is_customer_active_delivery(text) from public;
revoke all on function public.is_restaurant_assigned_delivery(text) from public;
revoke all on function public.is_restaurant_assigned_driver(text) from public;
revoke all on function public.is_customer_order(text) from public;
revoke all on function public.is_restaurant_order(text) from public;

grant execute on function public.logistics_active_order_statuses() to authenticated, service_role;
grant execute on function public.is_logistics_driver() to authenticated, service_role;
grant execute on function public.is_logistics_restaurant() to authenticated, service_role;
grant execute on function public.is_own_logistics_driver(text) to authenticated, service_role;
grant execute on function public.is_customer_active_delivery(text) to authenticated, service_role;
grant execute on function public.is_restaurant_assigned_delivery(text) to authenticated, service_role;
grant execute on function public.is_restaurant_assigned_driver(text) to authenticated, service_role;
grant execute on function public.is_customer_order(text) to authenticated, service_role;
grant execute on function public.is_restaurant_order(text) to authenticated, service_role;

-- =============================================================================
-- driver_latest_locations — drivers upsert own row only
-- =============================================================================

drop policy if exists "drivers_read_own_latest_location" on public.driver_latest_locations;
drop policy if exists "customers_read_order_latest_driver_location" on public.driver_latest_locations;
drop policy if exists "restaurants_read_order_latest_driver_location" on public.driver_latest_locations;

drop policy if exists "logistics_drivers_manage_own_latest_location" on public.driver_latest_locations;
create policy "logistics_drivers_manage_own_latest_location" on public.driver_latest_locations
  for all to authenticated
  using (public.is_own_logistics_driver(driver_id))
  with check (public.is_own_logistics_driver(driver_id));

drop policy if exists "logistics_customers_read_active_latest_location" on public.driver_latest_locations;
create policy "logistics_customers_read_active_latest_location" on public.driver_latest_locations
  for select to authenticated
  using (
    order_id is not null
    and public.is_customer_active_delivery(order_id)
  );

drop policy if exists "logistics_restaurants_read_assigned_latest_location" on public.driver_latest_locations;
create policy "logistics_restaurants_read_assigned_latest_location" on public.driver_latest_locations
  for select to authenticated
  using (
    order_id is not null
    and public.is_restaurant_assigned_delivery(order_id)
  );

drop policy if exists "logistics_admin_read_latest_locations" on public.driver_latest_locations;
create policy "logistics_admin_read_latest_locations" on public.driver_latest_locations
  for select to authenticated
  using (public.is_admin());

grant select, insert, update on public.driver_latest_locations to authenticated;

-- =============================================================================
-- driver_locations (archival history)
-- =============================================================================

drop policy if exists "drivers_read_own_locations" on public.driver_locations;
drop policy if exists "customers_read_order_driver_locations" on public.driver_locations;
drop policy if exists "restaurants_read_order_driver_locations" on public.driver_locations;

drop policy if exists "logistics_drivers_read_own_locations" on public.driver_locations;
create policy "logistics_drivers_read_own_locations" on public.driver_locations
  for select to authenticated
  using (public.is_own_logistics_driver(driver_id));

drop policy if exists "logistics_customers_read_active_locations" on public.driver_locations;
create policy "logistics_customers_read_active_locations" on public.driver_locations
  for select to authenticated
  using (
    order_id is not null
    and public.is_customer_active_delivery(order_id)
  );

drop policy if exists "logistics_restaurants_read_assigned_locations" on public.driver_locations;
create policy "logistics_restaurants_read_assigned_locations" on public.driver_locations
  for select to authenticated
  using (
    order_id is not null
    and public.is_restaurant_assigned_delivery(order_id)
  );

drop policy if exists "logistics_admin_read_locations" on public.driver_locations;
create policy "logistics_admin_read_locations" on public.driver_locations
  for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- driver_gps_samples
-- =============================================================================

drop policy if exists "drivers_read_own_gps" on public.driver_gps_samples;

drop policy if exists "logistics_drivers_read_own_gps" on public.driver_gps_samples;
create policy "logistics_drivers_read_own_gps" on public.driver_gps_samples
  for select to authenticated
  using (public.is_own_logistics_driver(driver_id));

drop policy if exists "logistics_admin_read_gps_samples" on public.driver_gps_samples;
create policy "logistics_admin_read_gps_samples" on public.driver_gps_samples
  for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- order_eta_snapshots
-- =============================================================================

drop policy if exists "customers_read_order_eta" on public.order_eta_snapshots;

drop policy if exists "logistics_customers_read_active_eta" on public.order_eta_snapshots;
create policy "logistics_customers_read_active_eta" on public.order_eta_snapshots
  for select to authenticated
  using (public.is_customer_active_delivery(order_id));

drop policy if exists "logistics_restaurants_read_assigned_eta" on public.order_eta_snapshots;
create policy "logistics_restaurants_read_assigned_eta" on public.order_eta_snapshots
  for select to authenticated
  using (public.is_restaurant_assigned_delivery(order_id));

drop policy if exists "logistics_drivers_read_assigned_eta" on public.order_eta_snapshots;
create policy "logistics_drivers_read_assigned_eta" on public.order_eta_snapshots
  for select to authenticated
  using (
    driver_id is not null
    and public.is_own_logistics_driver(driver_id)
  );

drop policy if exists "logistics_admin_read_eta_snapshots" on public.order_eta_snapshots;
create policy "logistics_admin_read_eta_snapshots" on public.order_eta_snapshots
  for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- delivery_route_history
-- =============================================================================

drop policy if exists "customers_read_route_history" on public.delivery_route_history;

drop policy if exists "logistics_customers_read_route_history" on public.delivery_route_history;
create policy "logistics_customers_read_route_history" on public.delivery_route_history
  for select to authenticated
  using (public.is_customer_order(order_id));

drop policy if exists "logistics_restaurants_read_route_history" on public.delivery_route_history;
create policy "logistics_restaurants_read_route_history" on public.delivery_route_history
  for select to authenticated
  using (public.is_restaurant_order(order_id));

drop policy if exists "logistics_drivers_read_route_history" on public.delivery_route_history;
create policy "logistics_drivers_read_route_history" on public.delivery_route_history
  for select to authenticated
  using (
    driver_id is not null
    and public.is_own_logistics_driver(driver_id)
  );

drop policy if exists "logistics_admin_read_route_history" on public.delivery_route_history;
create policy "logistics_admin_read_route_history" on public.delivery_route_history
  for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- delivery_routes
-- =============================================================================

drop policy if exists "drivers_read_own_delivery_routes" on public.delivery_routes;
drop policy if exists "customers_read_own_delivery_routes" on public.delivery_routes;

drop policy if exists "logistics_drivers_read_own_routes" on public.delivery_routes;
create policy "logistics_drivers_read_own_routes" on public.delivery_routes
  for select to authenticated
  using (public.is_own_logistics_driver(driver_id));

drop policy if exists "logistics_customers_read_own_routes" on public.delivery_routes;
create policy "logistics_customers_read_own_routes" on public.delivery_routes
  for select to authenticated
  using (public.is_customer_order(order_id));

drop policy if exists "logistics_restaurants_read_own_routes" on public.delivery_routes;
create policy "logistics_restaurants_read_own_routes" on public.delivery_routes
  for select to authenticated
  using (public.is_restaurant_order(order_id));

drop policy if exists "logistics_admin_read_routes" on public.delivery_routes;
create policy "logistics_admin_read_routes" on public.delivery_routes
  for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- delivery_metrics
-- =============================================================================

drop policy if exists "customers_read_own_delivery_metrics" on public.delivery_metrics;
drop policy if exists "restaurants_read_delivery_metrics" on public.delivery_metrics;

drop policy if exists "logistics_customers_read_own_metrics" on public.delivery_metrics;
create policy "logistics_customers_read_own_metrics" on public.delivery_metrics
  for select to authenticated
  using (public.is_customer_order(order_id));

drop policy if exists "logistics_restaurants_read_own_metrics" on public.delivery_metrics;
create policy "logistics_restaurants_read_own_metrics" on public.delivery_metrics
  for select to authenticated
  using (public.is_restaurant_order(order_id));

drop policy if exists "logistics_admin_read_metrics" on public.delivery_metrics;
create policy "logistics_admin_read_metrics" on public.delivery_metrics
  for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- delivery_demand_zones (heat map)
-- =============================================================================

drop policy if exists "authenticated_read_delivery_demand_zones" on public.delivery_demand_zones;

drop policy if exists "logistics_drivers_read_demand_zones" on public.delivery_demand_zones;
create policy "logistics_drivers_read_demand_zones" on public.delivery_demand_zones
  for select to authenticated
  using (public.is_logistics_driver());

drop policy if exists "logistics_restaurants_read_demand_zones" on public.delivery_demand_zones;
create policy "logistics_restaurants_read_demand_zones" on public.delivery_demand_zones
  for select to authenticated
  using (public.is_logistics_restaurant());

drop policy if exists "logistics_admin_read_demand_zones" on public.delivery_demand_zones;
create policy "logistics_admin_read_demand_zones" on public.delivery_demand_zones
  for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- driver_route_states
-- =============================================================================

drop policy if exists "drivers_read_own_route" on public.driver_route_states;

drop policy if exists "logistics_drivers_read_own_route_state" on public.driver_route_states;
create policy "logistics_drivers_read_own_route_state" on public.driver_route_states
  for select to authenticated
  using (public.is_own_logistics_driver(driver_id));

drop policy if exists "logistics_restaurants_read_assigned_route_state" on public.driver_route_states;
create policy "logistics_restaurants_read_assigned_route_state" on public.driver_route_states
  for select to authenticated
  using (public.is_restaurant_assigned_driver(driver_id));

drop policy if exists "logistics_admin_read_route_states" on public.driver_route_states;
create policy "logistics_admin_read_route_states" on public.driver_route_states
  for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- drivers table — location updates limited to own profile
-- =============================================================================

drop policy if exists "driver_own" on public.drivers;

drop policy if exists "logistics_drivers_manage_own_row" on public.drivers;
create policy "logistics_drivers_manage_own_row" on public.drivers
  for all to authenticated
  using (
    user_id = auth.uid()::text
    or exists (
      select 1 from public.users u
      where u.user_id = drivers.user_id and u.auth_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()::text
    or exists (
      select 1 from public.users u
      where u.user_id = drivers.user_id and u.auth_id = auth.uid()
    )
  );

drop policy if exists "logistics_admin_read_drivers" on public.drivers;
create policy "logistics_admin_read_drivers" on public.drivers
  for select to authenticated
  using (public.is_admin());
