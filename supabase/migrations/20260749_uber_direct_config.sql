-- Uber Direct admin configuration (credentials encrypted at rest; service-role only)

create table if not exists public.uber_direct_config (
  id text primary key default 'default',
  enabled boolean not null default false,
  backup_enabled boolean not null default false,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  client_id text,
  client_secret text,
  customer_id text,
  configured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.uber_direct_config (id, enabled, backup_enabled, environment, configured)
values ('default', false, false, 'sandbox', false)
on conflict (id) do nothing;

alter table public.uber_direct_config enable row level security;

-- No policies: only service_role (bypasses RLS) may read/write secrets.
revoke all on public.uber_direct_config from anon, authenticated;
grant all on public.uber_direct_config to service_role;
