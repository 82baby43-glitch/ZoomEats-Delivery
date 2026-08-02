-- Persist regulatory fee alongside other order pricing components

alter table public.orders
  add column if not exists regulatory_fee numeric(12,2) default 0;

alter table public.pricing_snapshots
  add column if not exists regulatory_fee numeric(12,2) default 0;
