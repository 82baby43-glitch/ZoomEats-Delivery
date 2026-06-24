-- Dispatch trigger: fires the Supabase Edge Function `dispatch-order` whenever
-- a new paid order is INSERTed OR an order transitions to payment_status='paid'.
-- Requires the `pg_net` extension (enable in Supabase Dashboard → Database → Extensions).

create extension if not exists pg_net;

-- Replace with your project ref + (no-jwt) function URL.
-- This is the URL of the deployed Edge Function. Find it in:
-- Supabase Dashboard → Edge Functions → dispatch-order → URL.
-- Example: https://njrrhckegbfqhwkqkzvw.functions.supabase.co/dispatch-order
do $$
declare
  fn_url text := 'https://njrrhckegbfqhwkqkzvw.functions.supabase.co/dispatch-order';
begin
  -- Helper function called by triggers
  execute format($f$
    create or replace function public.fn_dispatch_order_notify()
    returns trigger
    language plpgsql
    security definer
    as $body$
    declare
      should_fire boolean := false;
    begin
      if tg_op = 'INSERT' and new.payment_status = 'paid' then
        should_fire := true;
      elsif tg_op = 'UPDATE' and new.payment_status = 'paid' and old.payment_status <> 'paid' then
        should_fire := true;
      end if;
      if should_fire then
        perform net.http_post(
          url     := %L,
          headers := jsonb_build_object('Content-Type','application/json'),
          body    := jsonb_build_object(
            'type', tg_op,
            'record', to_jsonb(new),
            'order_id', new.order_id
          )
        );
      end if;
      return new;
    end;
    $body$;
  $f$, fn_url);
end$$;

-- Drop existing trigger if any (safe re-run)
drop trigger if exists trg_dispatch_order_insert on public.orders;
drop trigger if exists trg_dispatch_order_paid   on public.orders;

create trigger trg_dispatch_order_insert
after insert on public.orders
for each row execute function public.fn_dispatch_order_notify();

create trigger trg_dispatch_order_paid
after update of payment_status on public.orders
for each row execute function public.fn_dispatch_order_notify();
