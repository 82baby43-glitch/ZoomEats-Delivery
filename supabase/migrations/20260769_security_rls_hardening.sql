-- Security hardening: RLS for delivery/offer tables + founder table policies
-- Idempotent — safe to re-run

-- =============================================================================
-- Remove duplicate/orphan policies (not in codebase — created via dashboard)
-- These "Enable read access for all users" policies bypass scoped RLS.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'orders', 'drivers', 'deliveries', 'menu_items', 'restaurants',
    'user_sessions', 'ZoomEats', 'agreements_debug_priv', 'alembic_version'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Enable read access for all users', t);
  end loop;
end$$;

-- Re-assert users table least-privilege policies
drop policy if exists "users_read_own" on public.users;
create policy "users_read_own" on public.users
  for select to authenticated
  using (auth.uid()::text = user_id or auth.uid() = auth_id);

-- =============================================================================
-- RLS helper functions (from logistics migration — idempotent)
-- =============================================================================

create or replace function public.is_customer_order(target_order_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
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
    select 1 from public.orders o
    join public.restaurants r on r.restaurant_id = o.restaurant_id
    where o.order_id = target_order_id
      and r.owner_id = auth.uid()::text
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

revoke all on function public.is_customer_order(text) from public;
revoke all on function public.is_restaurant_order(text) from public;
revoke all on function public.is_own_logistics_driver(text) from public;
grant execute on function public.is_customer_order(text) to authenticated, service_role;
grant execute on function public.is_restaurant_order(text) to authenticated, service_role;
grant execute on function public.is_own_logistics_driver(text) to authenticated, service_role;

-- =============================================================================
-- driver_order_offers, driver_offer_events, delivery_events
-- These tables lacked RLS despite being in the realtime publication.
-- Backend uses service_role; client access is deny-by-default with scoped reads.
-- =============================================================================

alter table if exists public.driver_order_offers enable row level security;
alter table if exists public.driver_offer_events enable row level security;
alter table if exists public.delivery_events enable row level security;

revoke all on public.driver_order_offers from anon;
revoke all on public.driver_offer_events from anon;
revoke all on public.delivery_events from anon;

-- driver_order_offers: drivers see own offers; customers/restaurants see order-scoped; admins see all
drop policy if exists "offers_driver_read_own" on public.driver_order_offers;
create policy "offers_driver_read_own" on public.driver_order_offers
  for select to authenticated
  using (public.is_own_logistics_driver(driver_id));

drop policy if exists "offers_customer_read_own_order" on public.driver_order_offers;
create policy "offers_customer_read_own_order" on public.driver_order_offers
  for select to authenticated
  using (public.is_customer_order(order_id));

drop policy if exists "offers_restaurant_read_own_order" on public.driver_order_offers;
create policy "offers_restaurant_read_own_order" on public.driver_order_offers
  for select to authenticated
  using (public.is_restaurant_order(order_id));

drop policy if exists "offers_admin_read" on public.driver_order_offers;
create policy "offers_admin_read" on public.driver_order_offers
  for select to authenticated
  using (public.is_admin());

grant select on public.driver_order_offers to authenticated;

-- driver_offer_events: same scoping as offers (audit trail)
drop policy if exists "offer_events_driver_read" on public.driver_offer_events;
create policy "offer_events_driver_read" on public.driver_offer_events
  for select to authenticated
  using (
    driver_id is not null
    and public.is_own_logistics_driver(driver_id)
  );

drop policy if exists "offer_events_customer_read" on public.driver_offer_events;
create policy "offer_events_customer_read" on public.driver_offer_events
  for select to authenticated
  using (public.is_customer_order(order_id));

drop policy if exists "offer_events_restaurant_read" on public.driver_offer_events;
create policy "offer_events_restaurant_read" on public.driver_offer_events
  for select to authenticated
  using (public.is_restaurant_order(order_id));

drop policy if exists "offer_events_admin_read" on public.driver_offer_events;
create policy "offer_events_admin_read" on public.driver_offer_events
  for select to authenticated
  using (public.is_admin());

grant select on public.driver_offer_events to authenticated;

-- delivery_events: delivery timeline scoped by order relationship
drop policy if exists "delivery_events_customer_read" on public.delivery_events;
create policy "delivery_events_customer_read" on public.delivery_events
  for select to authenticated
  using (public.is_customer_order(order_id));

drop policy if exists "delivery_events_restaurant_read" on public.delivery_events;
create policy "delivery_events_restaurant_read" on public.delivery_events
  for select to authenticated
  using (public.is_restaurant_order(order_id));

drop policy if exists "delivery_events_driver_read" on public.delivery_events;
create policy "delivery_events_driver_read" on public.delivery_events
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      join public.drivers d on d.driver_id = o.driver_id
      where o.order_id = delivery_events.order_id
        and (
          d.user_id = auth.uid()::text
          or exists (
            select 1 from public.users u
            where u.user_id = d.user_id and u.auth_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "delivery_events_admin_read" on public.delivery_events;
create policy "delivery_events_admin_read" on public.delivery_events
  for select to authenticated
  using (public.is_admin());

grant select on public.delivery_events to authenticated;

-- =============================================================================
-- Founder tables: explicit deny-by-default replaced with founder-only policies
-- (grants existed but no policies — authenticated was already blocked; now explicit)
-- =============================================================================

create or replace function public.is_founder_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where (u.user_id = auth.uid()::text or u.auth_id = auth.uid())
      and (u.is_founder = true or u.founder_driver = true or u.role in ('admin', 'super_admin'))
  );
$$;

revoke all on function public.is_founder_operator() from public;
grant execute on function public.is_founder_operator() to authenticated, service_role;

-- founder_driver_sessions
drop policy if exists "founder_sessions_own" on public.founder_driver_sessions;
create policy "founder_sessions_own" on public.founder_driver_sessions
  for all to authenticated
  using (public.is_founder_operator() and user_id = auth.uid()::text)
  with check (public.is_founder_operator() and user_id = auth.uid()::text);

-- founder_pickup_logs
drop policy if exists "founder_pickup_own" on public.founder_pickup_logs;
create policy "founder_pickup_own" on public.founder_pickup_logs
  for all to authenticated
  using (public.is_founder_operator() and user_id = auth.uid()::text)
  with check (public.is_founder_operator() and user_id = auth.uid()::text);

-- founder_delivery_journals
drop policy if exists "founder_journal_own" on public.founder_delivery_journals;
create policy "founder_journal_own" on public.founder_delivery_journals
  for all to authenticated
  using (public.is_founder_operator() and user_id = auth.uid()::text)
  with check (public.is_founder_operator() and user_id = auth.uid()::text);

-- founder_dispatch_insights (insert-only for founders)
drop policy if exists "founder_insights_insert" on public.founder_dispatch_insights;
create policy "founder_insights_insert" on public.founder_dispatch_insights
  for insert to authenticated
  with check (public.is_founder_operator());

drop policy if exists "founder_insights_read" on public.founder_dispatch_insights;
create policy "founder_insights_read" on public.founder_dispatch_insights
  for select to authenticated
  using (public.is_founder_operator());

-- founder_order_notes
drop policy if exists "founder_notes_own" on public.founder_order_notes;
create policy "founder_notes_own" on public.founder_order_notes
  for all to authenticated
  using (public.is_founder_operator())
  with check (public.is_founder_operator());

-- founder_feature_feedback
drop policy if exists "founder_feedback_own" on public.founder_feature_feedback;
create policy "founder_feedback_own" on public.founder_feature_feedback
  for all to authenticated
  using (public.is_founder_operator())
  with check (public.is_founder_operator());

-- founder_customer_reviews
drop policy if exists "founder_reviews_own" on public.founder_customer_reviews;
create policy "founder_reviews_own" on public.founder_customer_reviews
  for all to authenticated
  using (public.is_founder_operator())
  with check (public.is_founder_operator());

-- restaurant_scorecard (read-only for founders)
drop policy if exists "founder_scorecard_read" on public.restaurant_scorecard;
create policy "founder_scorecard_read" on public.restaurant_scorecard
  for select to authenticated
  using (public.is_founder_operator());

-- founder_shadow_dispatches
drop policy if exists "founder_shadow_own" on public.founder_shadow_dispatches;
create policy "founder_shadow_own" on public.founder_shadow_dispatches
  for all to authenticated
  using (public.is_founder_operator())
  with check (public.is_founder_operator());
