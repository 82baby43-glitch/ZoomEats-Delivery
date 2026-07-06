-- Patch 6: Multi-channel notifications (in-app, email, SMS)

alter table public.compliance_notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text,
  add column if not exists action_url text,
  add column if not exists severity text not null default 'info',
  add column if not exists email_sent_at timestamptz,
  add column if not exists sms_sent_at timestamptz;

create index if not exists idx_compliance_notifications_dedupe
  on public.compliance_notifications (user_id, dedupe_key)
  where dedupe_key is not null and read_at is null;

create table if not exists public.notification_preferences (
  user_id text primary key,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  phone text,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  delivery_id text primary key,
  notification_id text not null references public.compliance_notifications(notification_id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'in_app')),
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  provider text,
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_deliveries_notification
  on public.notification_deliveries (notification_id, created_at desc);

alter table public.users
  add column if not exists phone text;

alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

grant select, insert, update on public.notification_preferences to authenticated;
grant select, update on public.compliance_notifications to authenticated;
grant all on public.notification_preferences to service_role;
grant all on public.notification_deliveries to service_role;

drop policy if exists "notification_preferences_own" on public.notification_preferences;
create policy "notification_preferences_own" on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()::text);

drop policy if exists "notification_deliveries_own" on public.notification_deliveries;
create policy "notification_deliveries_own" on public.notification_deliveries
  for select to authenticated
  using (
    notification_id in (
      select notification_id from public.compliance_notifications where user_id = auth.uid()::text
    )
  );
