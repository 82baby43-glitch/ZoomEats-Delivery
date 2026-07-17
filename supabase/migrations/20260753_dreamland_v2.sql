-- Dreamland AI Intelligence Upgrade v2.0

alter table public.dreamland_profiles
  add column if not exists dreamland_order_count int not null default 0;

alter table public.dreamland_sessions
  add column if not exists short_term_memory jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists refreshed_at timestamptz;

create table if not exists public.dreamland_analytics (
  event_id text primary key,
  user_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_dreamland_analytics_type on public.dreamland_analytics (event_type, created_at desc);
create index if not exists idx_dreamland_analytics_user on public.dreamland_analytics (user_id, created_at desc);

alter table public.dreamland_analytics enable row level security;

drop policy if exists dreamland_analytics_insert on public.dreamland_analytics;
create policy dreamland_analytics_insert on public.dreamland_analytics
  for insert with check (true);

drop policy if exists dreamland_analytics_admin on public.dreamland_analytics;
create policy dreamland_analytics_admin on public.dreamland_analytics
  for select using (
    exists (
      select 1 from public.users u
      where u.user_id = auth.uid()::text and u.role = 'admin'
    )
  );

grant select, insert on public.dreamland_analytics to authenticated;
grant all on public.dreamland_analytics to service_role;
