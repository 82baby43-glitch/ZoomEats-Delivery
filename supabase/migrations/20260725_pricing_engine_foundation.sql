-- ZoomEats Intelligent Pricing Engine — Foundation (ADDITIVE ONLY)
-- Safe to re-run. Does NOT modify/drop existing marketplace tables.
-- Depends on: public.orders(order_id), public.users(user_id), public.restaurants(restaurant_id)
-- Soft refs: driver_id (matches orders.driver_id — no FK on live DB)

-- =============================================================================
-- Helpers
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.role = 'admin'
      and (
        u.auth_id = auth.uid()
        or u.user_id = auth.uid()::text
      )
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- =============================================================================
-- pricing_rules
-- =============================================================================

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  rule_name text not null,
  rule_type text not null,
  value numeric(12,4) not null default 0,
  percentage numeric(8,4),
  minimum_amount numeric(12,2),
  maximum_amount numeric(12,2),
  active boolean not null default true,
  effective_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_rules_rule_type_check check (
    rule_type in (
      'driver_base_pay',
      'mileage_rate',
      'time_rate',
      'wait_rate',
      'service_fee',
      'commission_rate',
      'delivery_fee',
      'small_order_fee',
      'small_order_threshold',
      'distance_fee',
      'surge_fee',
      'surge_limit',
      'weather_multiplier',
      'weather_fee',
      'tax_rate',
      'stripe_fee_percent',
      'stripe_fee_fixed',
      'peak_bonus',
      'large_order_bonus',
      'large_order_threshold',
      'guaranteed_pay',
      'other'
    )
  )
);

create unique index if not exists idx_pricing_rules_name_type_active
  on public.pricing_rules (rule_name, rule_type)
  where active = true;

create index if not exists idx_pricing_rules_type_active
  on public.pricing_rules (rule_type, active, effective_date desc);

drop trigger if exists trg_pricing_rules_updated_at on public.pricing_rules;
create trigger trg_pricing_rules_updated_at
  before update on public.pricing_rules
  for each row execute procedure public.set_updated_at();

-- Seed default rules (idempotent by rule_name + rule_type)
insert into public.pricing_rules (rule_name, rule_type, value, percentage, minimum_amount, maximum_amount, active)
select v.rule_name, v.rule_type, v.value, v.percentage, v.minimum_amount, v.maximum_amount, true
from (values
  ('Driver Base Pay', 'driver_base_pay', 3.00, null::numeric, null::numeric, null::numeric),
  ('Mileage Rate', 'mileage_rate', 0.75, null, null, null),
  ('Time Rate', 'time_rate', 0.20, null, null, null),
  ('Wait Rate', 'wait_rate', 0.15, null, null, null),
  ('Service Fee', 'service_fee', 0, 8.0000, 0.99, 4.99),
  ('Commission Rate', 'commission_rate', 0, 15.0000, null, null),
  ('Delivery Fee', 'delivery_fee', 2.99, null, 1.99, 9.99),
  ('Small Order Fee', 'small_order_fee', 1.50, null, null, null),
  ('Small Order Threshold', 'small_order_threshold', 12.00, null, null, null),
  ('Distance Fee Per Mile', 'distance_fee', 0.50, null, 0, 8.00),
  ('Surge Fee Cap', 'surge_limit', 5.00, null, 0, 5.00),
  ('Weather Multiplier', 'weather_multiplier', 1.15, null, 1.00, 1.50),
  ('Weather Fee Flat', 'weather_fee', 1.00, null, 0, 3.00),
  ('Tax Rate', 'tax_rate', 0, 8.2500, null, null),
  ('Stripe Fee Percent', 'stripe_fee_percent', 0, 2.9000, null, null),
  ('Stripe Fee Fixed', 'stripe_fee_fixed', 0.30, null, null, null),
  ('Peak Bonus', 'peak_bonus', 2.00, null, null, null),
  ('Large Order Bonus', 'large_order_bonus', 3.00, null, null, null),
  ('Large Order Threshold', 'large_order_threshold', 50.00, null, null, null),
  ('Guaranteed Pay Floor', 'guaranteed_pay', 6.00, null, null, null)
) as v(rule_name, rule_type, value, percentage, minimum_amount, maximum_amount)
where not exists (
  select 1 from public.pricing_rules pr
  where pr.rule_name = v.rule_name and pr.rule_type = v.rule_type and pr.active = true
);

-- =============================================================================
-- pricing_snapshots (immutable accounting record)
-- =============================================================================

create table if not exists public.pricing_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id),
  customer_id text references public.users(user_id),
  restaurant_id text references public.restaurants(restaurant_id),
  driver_id text,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  service_fee numeric(12,2) not null default 0,
  small_order_fee numeric(12,2) not null default 0,
  distance_fee numeric(12,2) not null default 0,
  surge_fee numeric(12,2) not null default 0,
  weather_fee numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tip_amount numeric(12,2) not null default 0,
  customer_total numeric(12,2) not null default 0,
  rule_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_pricing_snapshots_order_id
  on public.pricing_snapshots (order_id);

create index if not exists idx_pricing_snapshots_customer_id
  on public.pricing_snapshots (customer_id);

create index if not exists idx_pricing_snapshots_restaurant_id
  on public.pricing_snapshots (restaurant_id);

create index if not exists idx_pricing_snapshots_created_at
  on public.pricing_snapshots (created_at desc);

create or replace function public.prevent_pricing_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'pricing_snapshots are immutable — never update or delete completed order pricing';
end;
$$;

drop trigger if exists trg_pricing_snapshots_no_update on public.pricing_snapshots;
create trigger trg_pricing_snapshots_no_update
  before update on public.pricing_snapshots
  for each row execute procedure public.prevent_pricing_snapshot_mutation();

drop trigger if exists trg_pricing_snapshots_no_delete on public.pricing_snapshots;
create trigger trg_pricing_snapshots_no_delete
  before delete on public.pricing_snapshots
  for each row execute procedure public.prevent_pricing_snapshot_mutation();

-- =============================================================================
-- driver_earnings
-- =============================================================================

create table if not exists public.driver_earnings (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id),
  driver_id text not null,
  base_pay numeric(12,2) not null default 0,
  mileage_pay numeric(12,2) not null default 0,
  time_pay numeric(12,2) not null default 0,
  wait_pay numeric(12,2) not null default 0,
  bonus_pay numeric(12,2) not null default 0,
  weather_bonus numeric(12,2) not null default 0,
  peak_bonus numeric(12,2) not null default 0,
  large_order_bonus numeric(12,2) not null default 0,
  customer_tip numeric(12,2) not null default 0,
  guaranteed_pay numeric(12,2) not null default 0,
  final_driver_pay numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_driver_earnings_order_id
  on public.driver_earnings (order_id);

create index if not exists idx_driver_earnings_driver_id
  on public.driver_earnings (driver_id, created_at desc);

create index if not exists idx_driver_earnings_created_at
  on public.driver_earnings (created_at desc);

-- =============================================================================
-- restaurant_settlements
-- =============================================================================

create table if not exists public.restaurant_settlements (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id),
  restaurant_id text not null references public.restaurants(restaurant_id),
  gross_sales numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  promotion_adjustment numeric(12,2) not null default 0,
  refund_adjustment numeric(12,2) not null default 0,
  chargeback_adjustment numeric(12,2) not null default 0,
  stripe_fee numeric(12,2) not null default 0,
  net_payout numeric(12,2) not null default 0,
  status text not null default 'pending',
  payout_date timestamptz,
  created_at timestamptz not null default now(),
  constraint restaurant_settlements_status_check check (
    status in ('pending', 'ready', 'paid', 'held', 'failed', 'reversed')
  )
);

create unique index if not exists idx_restaurant_settlements_order_id
  on public.restaurant_settlements (order_id);

create index if not exists idx_restaurant_settlements_restaurant_id
  on public.restaurant_settlements (restaurant_id, created_at desc);

create index if not exists idx_restaurant_settlements_status
  on public.restaurant_settlements (status, payout_date);

-- =============================================================================
-- platform_revenue
-- =============================================================================

create table if not exists public.platform_revenue (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id),
  delivery_revenue numeric(12,2) not null default 0,
  service_fee_revenue numeric(12,2) not null default 0,
  commission_revenue numeric(12,2) not null default 0,
  advertising_revenue numeric(12,2) not null default 0,
  subscription_revenue numeric(12,2) not null default 0,
  driver_cost numeric(12,2) not null default 0,
  restaurant_cost numeric(12,2) not null default 0,
  stripe_cost numeric(12,2) not null default 0,
  refund_cost numeric(12,2) not null default 0,
  promotion_cost numeric(12,2) not null default 0,
  net_profit numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_platform_revenue_order_id
  on public.platform_revenue (order_id);

create index if not exists idx_platform_revenue_created_at
  on public.platform_revenue (created_at desc);

-- =============================================================================
-- pricing_audit_logs
-- =============================================================================

create table if not exists public.pricing_audit_logs (
  id uuid primary key default gen_random_uuid(),
  order_id text,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  changed_by text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pricing_audit_logs_order_id
  on public.pricing_audit_logs (order_id, created_at desc);

create index if not exists idx_pricing_audit_logs_created_at
  on public.pricing_audit_logs (created_at desc);

create index if not exists idx_pricing_audit_logs_action
  on public.pricing_audit_logs (action, created_at desc);

-- =============================================================================
-- driver_metrics
-- =============================================================================

create table if not exists public.driver_metrics (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null,
  acceptance_rate numeric(8,4) not null default 0,
  completion_rate numeric(8,4) not null default 0,
  cancellation_rate numeric(8,4) not null default 0,
  rating numeric(4,2),
  total_deliveries integer not null default 0,
  total_earnings numeric(14,2) not null default 0,
  tier_level text not null default 'bronze',
  period_start date,
  period_end date,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint driver_metrics_tier_check check (
    tier_level in ('bronze', 'silver', 'gold', 'platinum')
  )
);

create unique index if not exists idx_driver_metrics_driver_period
  on public.driver_metrics (driver_id, period_start, period_end);

create index if not exists idx_driver_metrics_driver_id
  on public.driver_metrics (driver_id);

create index if not exists idx_driver_metrics_tier
  on public.driver_metrics (tier_level);

drop trigger if exists trg_driver_metrics_updated_at on public.driver_metrics;
create trigger trg_driver_metrics_updated_at
  before update on public.driver_metrics
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- restaurant_metrics
-- =============================================================================

create table if not exists public.restaurant_metrics (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(restaurant_id),
  preparation_speed_minutes numeric(8,2),
  order_accuracy_rate numeric(8,4) not null default 0,
  rating numeric(4,2),
  cancellation_rate numeric(8,4) not null default 0,
  customer_complaints integer not null default 0,
  sales_volume numeric(14,2) not null default 0,
  order_count integer not null default 0,
  tier_level text not null default 'standard',
  period_start date,
  period_end date,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint restaurant_metrics_tier_check check (
    tier_level in ('standard', 'preferred', 'premier', 'partner')
  )
);

create unique index if not exists idx_restaurant_metrics_restaurant_period
  on public.restaurant_metrics (restaurant_id, period_start, period_end);

create index if not exists idx_restaurant_metrics_restaurant_id
  on public.restaurant_metrics (restaurant_id);

create index if not exists idx_restaurant_metrics_tier
  on public.restaurant_metrics (tier_level);

drop trigger if exists trg_restaurant_metrics_updated_at on public.restaurant_metrics;
create trigger trg_restaurant_metrics_updated_at
  before update on public.restaurant_metrics
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- customer_memberships
-- =============================================================================

create table if not exists public.customer_memberships (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.users(user_id),
  plan text not null default 'free',
  status text not null default 'active',
  start_date timestamptz not null default now(),
  expiration_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_memberships_plan_check check (
    plan in ('free', 'plus', 'unlimited')
  ),
  constraint customer_memberships_status_check check (
    status in ('active', 'paused', 'expired', 'cancelled')
  )
);

create index if not exists idx_customer_memberships_customer_id
  on public.customer_memberships (customer_id, status);

create unique index if not exists idx_customer_memberships_one_active
  on public.customer_memberships (customer_id)
  where status = 'active';

drop trigger if exists trg_customer_memberships_updated_at on public.customer_memberships;
create trigger trg_customer_memberships_updated_at
  before update on public.customer_memberships
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- promotions
-- =============================================================================

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null,
  discount_value numeric(12,4) not null,
  usage_limit integer,
  usage_count integer not null default 0,
  active boolean not null default true,
  expiration_date timestamptz,
  minimum_subtotal numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_discount_type_check check (
    discount_type in ('percent', 'fixed', 'free_delivery')
  )
);

create unique index if not exists idx_promotions_code_unique
  on public.promotions (lower(code));

create index if not exists idx_promotions_active_expiration
  on public.promotions (active, expiration_date);

drop trigger if exists trg_promotions_updated_at on public.promotions;
create trigger trg_promotions_updated_at
  before update on public.promotions
  for each row execute procedure public.set_updated_at();

comment on table public.pricing_rules is 'Configurable marketplace pricing logic (fees, pay rates, multipliers)';
comment on table public.pricing_snapshots is 'Immutable per-order pricing breakdown for accounting accuracy';
comment on table public.driver_earnings is 'Per-order driver compensation breakdown';
comment on table public.restaurant_settlements is 'Per-order merchant payout ledger (Stripe Connect ready)';
comment on table public.platform_revenue is 'Per-order ZoomEats economics / net profit';
comment on table public.pricing_audit_logs is 'Financial change audit trail for pricing engine';
