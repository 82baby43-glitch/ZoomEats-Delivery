-- Patch 3 & 4: Restaurant Commission Engine + Profit Protection Engine

-- =============================================================================
-- Merchant commission plans
-- =============================================================================

create table if not exists public.merchant_commission_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  commission_percent numeric(8,4) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_merchant_commission_plans_updated_at on public.merchant_commission_plans;
create trigger trg_merchant_commission_plans_updated_at
  before update on public.merchant_commission_plans
  for each row execute procedure public.set_updated_at();

insert into public.merchant_commission_plans (slug, name, description, commission_percent, active)
select v.slug, v.name, v.description, v.commission_percent, true
from (values
  ('standard', 'Standard', 'Default marketplace commission', 15.0000),
  ('preferred', 'Preferred Partner', 'Volume partner rate', 12.0000),
  ('premier', 'Premier', 'High-volume merchant rate', 10.0000),
  ('partner', 'Strategic Partner', 'Lowest commission tier', 8.0000)
) as v(slug, name, description, commission_percent)
where not exists (select 1 from public.merchant_commission_plans p where p.slug = v.slug);

alter table public.restaurants
  add column if not exists commission_plan_id uuid references public.merchant_commission_plans(id);

create index if not exists idx_restaurants_commission_plan
  on public.restaurants (commission_plan_id);

-- =============================================================================
-- Settlement batch summaries (weekly payout rollups)
-- =============================================================================

create table if not exists public.restaurant_settlement_batches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(restaurant_id),
  period_start date not null,
  period_end date not null,
  order_count int not null default 0,
  gross_sales numeric(12,2) not null default 0,
  commission_total numeric(12,2) not null default 0,
  net_payout_total numeric(12,2) not null default 0,
  status text not null default 'open',
  payout_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_settlement_batches_status_check check (
    status in ('open', 'ready', 'paid', 'held')
  )
);

create unique index if not exists idx_settlement_batches_restaurant_period
  on public.restaurant_settlement_batches (restaurant_id, period_start, period_end);

create index if not exists idx_settlement_batches_restaurant_created
  on public.restaurant_settlement_batches (restaurant_id, created_at desc);

drop trigger if exists trg_restaurant_settlement_batches_updated_at on public.restaurant_settlement_batches;
create trigger trg_restaurant_settlement_batches_updated_at
  before update on public.restaurant_settlement_batches
  for each row execute procedure public.set_updated_at();

alter table public.restaurant_settlements
  add column if not exists commission_percent numeric(8,4),
  add column if not exists commission_plan_slug text,
  add column if not exists batch_id uuid references public.restaurant_settlement_batches(id);

create index if not exists idx_restaurant_settlements_batch_id
  on public.restaurant_settlements (batch_id);

-- =============================================================================
-- Profit protection audit log
-- =============================================================================

create table if not exists public.profit_protection_logs (
  id uuid primary key default gen_random_uuid(),
  order_id text,
  restaurant_id text,
  customer_id text,
  action text not null,
  min_profit_required numeric(12,2) not null default 0,
  profit_before numeric(12,2) not null default 0,
  profit_after numeric(12,2),
  subsidy_allowed boolean not null default false,
  delivery_fee_before numeric(12,2),
  delivery_fee_after numeric(12,2),
  service_fee_before numeric(12,2),
  service_fee_after numeric(12,2),
  customer_total numeric(12,2),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint profit_protection_logs_action_check check (
    action in ('passed', 'adjusted', 'subsidized', 'blocked')
  )
);

create index if not exists idx_profit_protection_logs_order
  on public.profit_protection_logs (order_id, created_at desc);

create index if not exists idx_profit_protection_logs_created
  on public.profit_protection_logs (created_at desc);

create index if not exists idx_profit_protection_logs_action
  on public.profit_protection_logs (action, created_at desc);

alter table public.merchant_commission_plans enable row level security;
alter table public.restaurant_settlement_batches enable row level security;
alter table public.profit_protection_logs enable row level security;

drop policy if exists merchant_commission_plans_read on public.merchant_commission_plans;
create policy merchant_commission_plans_read on public.merchant_commission_plans
  for select to authenticated
  using (active = true or public.is_admin());

drop policy if exists settlement_batches_vendor_read on public.restaurant_settlement_batches;
create policy settlement_batches_vendor_read on public.restaurant_settlement_batches
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.restaurants r
      where r.restaurant_id = restaurant_settlement_batches.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  );

drop policy if exists profit_protection_logs_admin_read on public.profit_protection_logs;
create policy profit_protection_logs_admin_read on public.profit_protection_logs
  for select to authenticated
  using (public.is_admin());

grant select on public.merchant_commission_plans to authenticated;
grant select on public.restaurant_settlement_batches to authenticated;
grant select on public.profit_protection_logs to authenticated;
grant select, insert, update, delete on public.merchant_commission_plans to service_role;
grant select, insert, update, delete on public.restaurant_settlement_batches to service_role;
grant select, insert, update, delete on public.profit_protection_logs to service_role;
