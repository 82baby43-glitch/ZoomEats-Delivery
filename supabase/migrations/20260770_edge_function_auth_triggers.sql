-- Edge function auth: DB triggers/cron send Authorization from Supabase Vault secret.
-- Pair with: npm run edge:secret-setup (sets EDGE_FUNCTION_SECRET in edge + vault)

create or replace function public.edge_function_request_headers()
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret text;
begin
  select ds.decrypted_secret into secret
  from vault.decrypted_secrets ds
  where ds.name = 'EDGE_FUNCTION_SECRET'
  limit 1;

  if secret is null or length(trim(secret)) = 0 then
    return jsonb_build_object('Content-Type', 'application/json');
  end if;

  return jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || secret
  );
end;
$$;

revoke all on function public.edge_function_request_headers() from public;
grant execute on function public.edge_function_request_headers() to service_role;

-- dispatch-order trigger (paid + confirmed orders)
create or replace function public.fn_dispatch_order_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
declare
  should_fire boolean := false;
  fn_url text := '[REDACTED]/functions/v1/dispatch-order'; -- pragma: allowlist secret
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
      headers := public.edge_function_request_headers(),
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

-- offer-order trigger (restaurant accepts paid unassigned order)
create or replace function public.fn_offer_order_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
declare
  fn_url text := '[REDACTED]/functions/v1/offer-order'; -- pragma: allowlist secret
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
      url     := fn_url,
      headers := public.edge_function_request_headers(),
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

-- routing-engine cron loop (re-schedule with auth headers)
do $$
declare
  fn_url text := '[REDACTED]/functions/v1/routing-engine?action=loop'; -- pragma: allowlist secret
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'zoomeats-routing-loop';

  perform cron.schedule(
    'zoomeats-routing-loop',
    '*/1 * * * *',
    format(
      $cron$
      select net.http_post(
        url := %L,
        headers := public.edge_function_request_headers(),
        body := '{}'::jsonb
      );
      $cron$,
      fn_url
    )
  );
exception
  when others then
    raise notice 'routing cron schedule skipped: %', sqlerrm;
end $$;
