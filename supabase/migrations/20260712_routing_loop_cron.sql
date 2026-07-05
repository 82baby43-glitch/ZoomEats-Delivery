-- Schedule routing optimization loop every 15 seconds (safe to re-run)
-- Requires pg_cron + pg_net (enabled on Supabase hosted projects)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

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
        headers := jsonb_build_object('Content-Type', 'application/json'),
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
