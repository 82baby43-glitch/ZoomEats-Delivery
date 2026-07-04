-- Point dispatch trigger at canonical Edge Function URL (safe to re-run)
create or replace function public.fn_dispatch_order_notify()
returns trigger
language plpgsql
security definer
as $body$
declare
  should_fire boolean := false;
  fn_url text := 'https://njrrhckegbfqhwkqkzvw.supabase.co/functions/v1/dispatch-order'; -- pragma: allowlist secret
begin
  if tg_op = 'INSERT' and new.payment_status = 'paid' then
    should_fire := true;
  elsif tg_op = 'UPDATE' and new.payment_status = 'paid' and old.payment_status <> 'paid' then
    should_fire := true;
  end if;

  if should_fire then
    perform net.http_post(
      url     := fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
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
