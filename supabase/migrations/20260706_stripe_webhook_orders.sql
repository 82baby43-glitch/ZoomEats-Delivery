-- Webhook order columns (safe to re-run)
alter table public.orders
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists updated_at timestamptz default now();
