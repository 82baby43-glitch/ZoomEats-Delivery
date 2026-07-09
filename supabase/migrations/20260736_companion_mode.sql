-- ZoomEats Companion Mode™ — additive driver/restaurant experience layer
-- Does NOT alter orders, dispatch, GPS, payments, or core delivery logic.

create table if not exists public.companion_settings (
  id text primary key,
  user_id text not null unique,
  role text not null check (role in ('driver', 'restaurant')),
  music_provider text check (music_provider in ('spotify', 'apple_music', 'youtube_music')),
  music_connected boolean not null default false,
  audio_preferences jsonb not null default '{"musicVolume":70,"duckingEnabled":true,"safetyMode":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_companion_settings_user on public.companion_settings (user_id);
create index if not exists idx_companion_settings_role on public.companion_settings (role, updated_at desc);

-- Driver-facing music preference view (no duplicate data)
create or replace view public.driver_music_preferences as
select
  id,
  user_id as driver_id,
  music_provider as provider,
  music_connected as connected,
  created_at,
  updated_at
from public.companion_settings
where role = 'driver';

alter table public.companion_settings enable row level security;

drop policy if exists companion_settings_own on public.companion_settings;
create policy companion_settings_own on public.companion_settings
  for all using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

grant select, insert, update on public.companion_settings to authenticated;
grant select on public.driver_music_preferences to authenticated;
grant all on public.companion_settings to service_role;

alter publication supabase_realtime add table public.companion_settings;

comment on table public.companion_settings is 'Companion Mode preferences — music connection status and audio settings (no OAuth tokens stored)';
