-- Smart driver order offers with 20-second acceptance timer

create table if not exists public.driver_order_offers (
  offer_id text primary key,
  order_id text not null references public.orders(order_id) on delete cascade,
  driver_id text not null references public.drivers(driver_id) on delete cascade,
  status text not null default 'pending',
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  response_ms int,
  estimated_distance_km double precision,
  estimated_earnings numeric(10, 2),
  estimated_eta_min int,
  locked_device_id text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists driver_order_offers_order_idx on public.driver_order_offers(order_id, offered_at desc);
create index if not exists driver_order_offers_driver_pending_idx on public.driver_order_offers(driver_id, status) where status = 'pending';
create index if not exists driver_order_offers_order_status_idx on public.driver_order_offers(order_id, status);

comment on column public.driver_order_offers.status is 'pending | accepted | declined | expired | cancelled';

create table if not exists public.driver_offer_events (
  event_id text primary key,
  order_id text not null references public.orders(order_id) on delete cascade,
  offer_id text references public.driver_order_offers(offer_id) on delete set null,
  driver_id text,
  event_type text not null,
  message text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists driver_offer_events_order_idx on public.driver_offer_events(order_id, created_at);

alter table public.orders
  add column if not exists current_offer_id text,
  add column if not exists offer_round int default 0;

-- Trigger offer-order edge function when restaurant accepts a paid unassigned order
create extension if not exists pg_net;

do $$
declare
  fn_url text := 'https://njrrhckegbfqhwkqkzvw.functions.supabase.co/offer-order';
begin
  execute format($f$
    create or replace function public.fn_offer_order_notify()
    returns trigger
    language plpgsql
    security definer
    as $body$
    begin
      if tg_op = 'UPDATE'
        and new.status = 'accepted'
        and old.status is distinct from 'accepted'
        and new.payment_status = 'paid'
        and new.driver_id is null
        and coalesce(new.delivery_type, 'internal') <> 'uber'
        and new.status <> 'assigned_uber'
      then
        perform net.http_post(
          url     := %L,
          headers := jsonb_build_object('Content-Type','application/json'),
          body    := jsonb_build_object(
            'type', 'accepted',
            'order_id', new.order_id,
            'record', to_jsonb(new)
          )
        );
      end if;
      return new;
    end;
    $body$;
  $f$, fn_url);
end$$;

drop trigger if exists trg_offer_order_accepted on public.orders;
create trigger trg_offer_order_accepted
after update of status on public.orders
for each row execute function public.fn_offer_order_notify();

alter publication supabase_realtime add table public.driver_order_offers;
