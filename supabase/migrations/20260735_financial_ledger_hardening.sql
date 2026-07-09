-- Financial ledger hardening: status columns + restaurant_payouts view (no duplicate tables)

alter table public.driver_earnings
  add column if not exists status text not null default 'calculated';

alter table public.restaurant_settlements
  add column if not exists stripe_transfer_id text;

comment on column public.driver_earnings.status is 'calculated | paid | held | reversed';
comment on column public.restaurant_settlements.stripe_transfer_id is 'Stripe Connect transfer id when payout executed';

-- Friendly alias view (maps to restaurant_settlements — do not duplicate data)
create or replace view public.restaurant_payouts as
select
  id,
  restaurant_id,
  order_id,
  gross_sales as order_total,
  commission_amount,
  net_payout as restaurant_amount,
  stripe_transfer_id,
  status,
  created_at
from public.restaurant_settlements;

grant select on public.restaurant_payouts to authenticated;
grant select on public.restaurant_payouts to service_role;
