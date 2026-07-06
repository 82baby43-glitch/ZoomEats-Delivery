-- Dreamland AI — emotionally intelligent food recommendation engine

create table if not exists public.dreamland_profiles (
  user_id text primary key,
  display_name text,
  onboarding_complete boolean not null default false,
  last_mood text,
  last_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dreamland_preferences (
  user_id text primary key,
  dietary_restrictions text[] not null default '{}',
  favorite_cuisines text[] not null default '{}',
  avoid_ingredients text[] not null default '{}',
  budget_max numeric(8, 2),
  prefers_healthy boolean,
  prefers_fast boolean,
  spice_tolerance text default 'medium',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dreamland_sessions (
  session_id text primary key,
  user_id text not null,
  mood text,
  hunger_level text,
  budget_max numeric(8, 2),
  wants_healthy boolean,
  wants_fast boolean,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dreamland_sessions_user on public.dreamland_sessions (user_id, updated_at desc);

create table if not exists public.dreamland_conversations (
  message_id text primary key,
  session_id text not null,
  user_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  text text not null,
  mood text,
  recommendations jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_dreamland_conversations_session on public.dreamland_conversations (session_id, created_at asc);
create index if not exists idx_dreamland_conversations_user on public.dreamland_conversations (user_id, created_at desc);

create table if not exists public.dreamland_recommendations (
  recommendation_id text primary key,
  user_id text not null,
  session_id text,
  restaurant_id text not null,
  menu_item_id text,
  match_score numeric(5, 2) not null,
  match_label text,
  emotion_match numeric(5, 2),
  craving_match numeric(5, 2),
  score_breakdown jsonb not null default '{}'::jsonb,
  why text not null,
  why_now text,
  why_restaurant text,
  why_meal text,
  satisfaction_score numeric(5, 2),
  mood text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_dreamland_recs_user on public.dreamland_recommendations (user_id, created_at desc);

create table if not exists public.dreamland_feedback (
  feedback_id text primary key,
  user_id text not null,
  recommendation_id text,
  restaurant_id text,
  action text not null check (action in ('accepted', 'ignored', 'saved', 'ordered', 'rated', 'dismissed')),
  rating int check (rating between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_dreamland_feedback_user on public.dreamland_feedback (user_id, created_at desc);

create table if not exists public.dreamland_memory (
  memory_id text primary key,
  user_id text not null,
  memory_key text not null,
  memory_value text not null,
  confidence numeric(4, 3) not null default 0.5,
  source text default 'inferred',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_dreamland_memory_user_key on public.dreamland_memory (user_id, memory_key);

create table if not exists public.dreamland_rankings (
  ranking_id text primary key,
  user_id text not null,
  context_hash text not null,
  mood text,
  rankings jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dreamland_rankings_lookup on public.dreamland_rankings (user_id, context_hash, expires_at desc);

alter table public.dreamland_profiles enable row level security;
alter table public.dreamland_preferences enable row level security;
alter table public.dreamland_sessions enable row level security;
alter table public.dreamland_conversations enable row level security;
alter table public.dreamland_recommendations enable row level security;
alter table public.dreamland_feedback enable row level security;
alter table public.dreamland_memory enable row level security;
alter table public.dreamland_rankings enable row level security;

grant select, insert, update on public.dreamland_profiles to authenticated;
grant select, insert, update on public.dreamland_preferences to authenticated;
grant select, insert, update on public.dreamland_sessions to authenticated;
grant select, insert on public.dreamland_conversations to authenticated;
grant select, insert on public.dreamland_recommendations to authenticated;
grant select, insert on public.dreamland_feedback to authenticated;
grant select on public.dreamland_memory to authenticated;
grant select on public.dreamland_rankings to authenticated;

grant all on public.dreamland_profiles to service_role;
grant all on public.dreamland_preferences to service_role;
grant all on public.dreamland_sessions to service_role;
grant all on public.dreamland_conversations to service_role;
grant all on public.dreamland_recommendations to service_role;
grant all on public.dreamland_feedback to service_role;
grant all on public.dreamland_memory to service_role;
grant all on public.dreamland_rankings to service_role;

drop policy if exists "dreamland_profiles_own" on public.dreamland_profiles;
create policy "dreamland_profiles_own" on public.dreamland_profiles
  for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "dreamland_preferences_own" on public.dreamland_preferences;
create policy "dreamland_preferences_own" on public.dreamland_preferences
  for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "dreamland_sessions_own" on public.dreamland_sessions;
create policy "dreamland_sessions_own" on public.dreamland_sessions
  for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "dreamland_conversations_own" on public.dreamland_conversations;
create policy "dreamland_conversations_own" on public.dreamland_conversations
  for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "dreamland_recommendations_own" on public.dreamland_recommendations;
create policy "dreamland_recommendations_own" on public.dreamland_recommendations
  for select to authenticated using (user_id = auth.uid()::text);

drop policy if exists "dreamland_feedback_own" on public.dreamland_feedback;
create policy "dreamland_feedback_own" on public.dreamland_feedback
  for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "dreamland_memory_own" on public.dreamland_memory;
create policy "dreamland_memory_own" on public.dreamland_memory
  for select to authenticated using (user_id = auth.uid()::text);

drop policy if exists "dreamland_rankings_own" on public.dreamland_rankings;
create policy "dreamland_rankings_own" on public.dreamland_rankings
  for select to authenticated using (user_id = auth.uid()::text);
