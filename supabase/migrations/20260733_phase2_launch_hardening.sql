-- Phase 2 launch hardening: system events log

create table if not exists public.system_events (
  event_id text primary key,
  event_type text not null,
  severity text not null default 'info',
  source text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_events_created on public.system_events (created_at desc);
create index if not exists idx_system_events_type on public.system_events (event_type);

alter table public.system_events enable row level security;

drop policy if exists "system_events_admin_read" on public.system_events;
create policy "system_events_admin_read" on public.system_events
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.user_id = auth.uid()::text and u.role = 'admin'
    )
  );

grant select on public.system_events to authenticated;
grant all on public.system_events to service_role;
