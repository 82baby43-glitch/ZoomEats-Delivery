-- Driver safety events & support chat (additive logistics safety layer)

create table if not exists public.driver_safety_events (
  event_id text primary key,
  user_id text not null,
  driver_id text,
  event_type text not null check (event_type in ('emergency', 'support_chat', 'accident', 'unsafe_location', 'road_closure')),
  message text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  order_id text,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'escalated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_driver_safety_events_user on public.driver_safety_events (user_id, created_at desc);
create index if not exists idx_driver_safety_events_type on public.driver_safety_events (event_type, status, created_at desc);
create index if not exists idx_driver_safety_events_driver on public.driver_safety_events (driver_id, created_at desc);

create table if not exists public.driver_safety_messages (
  message_id text primary key,
  event_id text not null references public.driver_safety_events(event_id) on delete cascade,
  sender_role text not null check (sender_role in ('driver', 'support', 'system')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_driver_safety_messages_event on public.driver_safety_messages (event_id, created_at asc);

alter table public.driver_safety_events enable row level security;
alter table public.driver_safety_messages enable row level security;

create policy driver_safety_events_own on public.driver_safety_events
  for all using (auth.uid()::text = user_id);

create policy driver_safety_messages_via_event on public.driver_safety_messages
  for select using (
    exists (
      select 1 from public.driver_safety_events e
      where e.event_id = driver_safety_messages.event_id
        and e.user_id = auth.uid()::text
    )
  );

create policy driver_safety_messages_insert_own on public.driver_safety_messages
  for insert with check (
    exists (
      select 1 from public.driver_safety_events e
      where e.event_id = driver_safety_messages.event_id
        and e.user_id = auth.uid()::text
    )
  );

grant select, insert, update on public.driver_safety_events to authenticated;
grant select, insert on public.driver_safety_messages to authenticated;
