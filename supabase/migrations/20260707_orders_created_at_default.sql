-- Ensure orders.created_at auto-populates (safe to re-run)
alter table public.orders
  alter column created_at set default now();

update public.orders
set created_at = coalesce(created_at, now())
where created_at is null;
