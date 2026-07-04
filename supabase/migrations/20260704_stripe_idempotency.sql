-- Stripe idempotency + dispatch gate columns (safe to re-run)

create table if not exists public.stripe_event_log (
  event_id text primary key,
  type text not null,
  session_id text,
  status text not null default 'processed',
  processed_at timestamptz not null default now()
);

create index if not exists idx_stripe_event_log_session
  on public.stripe_event_log (session_id)
  where session_id is not null;

create index if not exists idx_stripe_event_log_type
  on public.stripe_event_log (type, processed_at desc);

alter table public.orders
  add column if not exists dispatch_status text;

-- RLS: deny direct client access (service role only)
alter table public.stripe_event_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stripe_event_log' and policyname = 'stripe_event_log_deny_all'
  ) then
    create policy stripe_event_log_deny_all on public.stripe_event_log
      for all using (false) with check (false);
  end if;
end$$;
