-- Daily compliance notification scan (insurance/license expiry, agreement updates, payout issues)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  fn_url text := '[REDACTED]/functions/v1/notification-scan'; -- pragma: allowlist secret
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'zoomeats-notification-scan';

  perform cron.schedule(
    'zoomeats-notification-scan',
    '0 14 * * *',
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
    raise notice 'notification cron schedule skipped: %', sqlerrm;
end $$;
