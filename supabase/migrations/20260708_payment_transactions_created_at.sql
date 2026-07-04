-- Ensure payment_transactions.created_at auto-populates (safe to re-run)
alter table public.payment_transactions
  alter column created_at set default now();

update public.payment_transactions
set created_at = coalesce(created_at, now())
where created_at is null;
