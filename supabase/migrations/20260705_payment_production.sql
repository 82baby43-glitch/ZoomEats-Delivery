-- Production payment system tables + order state machine (safe to re-run)

-- Extend stripe_event_log for full idempotency metadata
alter table public.stripe_event_log
  add column if not exists event_type text,
  add column if not exists stripe_session_id text,
  add column if not exists payment_intent_id text;

update public.stripe_event_log
set
  event_type = coalesce(event_type, type),
  stripe_session_id = coalesce(stripe_session_id, session_id)
where event_type is null or stripe_session_id is null;

create index if not exists idx_stripe_event_log_pi
  on public.stripe_event_log (payment_intent_id)
  where payment_intent_id is not null;

-- One checkout session per order — prevents duplicate orders per checkout
create table if not exists public.stripe_checkout_sessions (
  session_id text primary key,
  order_id text not null,
  status text not null default 'created',
  payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_stripe_checkout_sessions_order
  on public.stripe_checkout_sessions (order_id);

create index if not exists idx_stripe_checkout_sessions_status
  on public.stripe_checkout_sessions (status, created_at desc);

-- Webhook / reconciliation error log with retry tracking
create table if not exists public.payment_error_logs (
  id bigserial primary key,
  event_id text,
  order_id text,
  session_id text,
  error_message text not null,
  retry_count int not null default 0,
  source text not null default 'webhook',
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_error_logs_event
  on public.payment_error_logs (event_id, created_at desc);

-- Full payment audit trail
create table if not exists public.payment_audit_log (
  id bigserial primary key,
  order_id text not null,
  action text not null,
  source text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_audit_log_order
  on public.payment_audit_log (order_id, created_at desc);

-- Order state machine columns
alter table public.orders
  add column if not exists order_status text,
  add column if not exists confirmed_at timestamptz;

-- Backfill legacy rows
update public.orders
set order_status = case
  when payment_status = 'paid' and status in ('placed', 'accepted', 'preparing', 'ready', 'assigned_internal', 'assigned_uber', 'picked_up', 'delivered') then 'confirmed'
  when status = 'pending_payment' or payment_status in ('pending', 'initiated', 'requires_payment', 'processing') then 'awaiting_payment'
  when payment_status = 'failed' then 'cancelled'
  else coalesce(order_status, 'created')
end
where order_status is null;

update public.orders
set confirmed_at = coalesce(confirmed_at, created_at)
where payment_status = 'paid' and confirmed_at is null;

-- RLS: service role only
alter table public.stripe_checkout_sessions enable row level security;
alter table public.payment_error_logs enable row level security;
alter table public.payment_audit_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'stripe_checkout_sessions_deny_all') then
    create policy stripe_checkout_sessions_deny_all on public.stripe_checkout_sessions for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'payment_error_logs_deny_all') then
    create policy payment_error_logs_deny_all on public.payment_error_logs for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'payment_audit_log_deny_all') then
    create policy payment_audit_log_deny_all on public.payment_audit_log for all using (false) with check (false);
  end if;
end$$;

-- Dispatch trigger: gate on order_status = confirmed + dispatch_status IS NULL
create or replace function public.fn_dispatch_order_notify()
returns trigger
language plpgsql
security definer
as $body$
declare
  should_fire boolean := false;
  fn_url text := 'https://njrrhckegbfqhwkqkzvw.functions.supabase.co/dispatch-order';
  effective_order_status text;
begin
  effective_order_status := coalesce(
    new.order_status,
    case when new.status = 'placed' then 'confirmed' else null end
  );

  if new.payment_status = 'paid'
    and effective_order_status = 'confirmed'
    and new.dispatch_status is null then
    if tg_op = 'INSERT' then
      should_fire := true;
    elsif tg_op = 'UPDATE' and old.payment_status <> 'paid' then
      should_fire := true;
    elsif tg_op = 'UPDATE' and coalesce(old.order_status, '') <> 'confirmed' then
      should_fire := true;
    end if;
  end if;

  if should_fire then
    perform net.http_post(
      url     := fn_url,
      headers := jsonb_build_object('Content-Type','application/json'),
      body    := jsonb_build_object(
        'type', tg_op,
        'record', to_jsonb(new),
        'order_id', new.order_id
      )
    );
  end if;
  return new;
exception when others then
  return new;
end;
$body$;
