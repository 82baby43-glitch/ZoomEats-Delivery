-- Admin Restaurant Test Mode: isolated sandbox restaurant + orders

alter table public.restaurants
  add column if not exists restaurant_type text not null default 'standard',
  add column if not exists is_test_account boolean not null default false;

alter table public.orders
  add column if not exists test_order boolean not null default false;

create index if not exists idx_restaurants_is_test_account
  on public.restaurants (is_test_account)
  where is_test_account = true;

create index if not exists idx_orders_test_order
  on public.orders (test_order)
  where test_order = true;

comment on column public.restaurants.restaurant_type is 'standard | test — test kitchens are admin-only simulators';
comment on column public.restaurants.is_test_account is 'Sandbox merchant excluded from marketplace and payouts';
comment on column public.orders.test_order is 'Sandbox order excluded from Stripe, payouts, and revenue reports';
