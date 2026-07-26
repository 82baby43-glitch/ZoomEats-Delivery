-- Production restaurant dashboard: store settings + secure messaging

alter table public.restaurants
  add column if not exists business_hours jsonb not null default '{}'::jsonb,
  add column if not exists delivery_radius_km numeric(8,2),
  add column if not exists minimum_order numeric(10,2),
  add column if not exists busy_mode boolean not null default false,
  add column if not exists holiday_schedule jsonb not null default '[]'::jsonb,
  add column if not exists temporary_closure jsonb,
  add column if not exists online_status boolean not null default true;

alter table public.menu_items
  add column if not exists sold_out boolean not null default false,
  add column if not exists availability_schedule jsonb;

comment on column public.restaurants.business_hours is 'Weekly hours map, e.g. {"mon":{"open":"09:00","close":"22:00"}}';
comment on column public.restaurants.online_status is 'Restaurant-controlled online/offline toggle (distinct from accepting_orders pause)';

-- Secure restaurant messaging (restaurant ↔ customer/driver/support)
create table if not exists public.restaurant_conversations (
  conversation_id text primary key,
  restaurant_id text not null references public.restaurants(restaurant_id) on delete cascade,
  order_id text references public.orders(order_id) on delete set null,
  participant_type text not null check (participant_type in ('customer', 'driver', 'support')),
  participant_id text,
  participant_name text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurant_conversations_restaurant
  on public.restaurant_conversations (restaurant_id, last_message_at desc);

create index if not exists idx_restaurant_conversations_order
  on public.restaurant_conversations (order_id)
  where order_id is not null;

create table if not exists public.restaurant_messages (
  message_id text primary key,
  conversation_id text not null references public.restaurant_conversations(conversation_id) on delete cascade,
  restaurant_id text not null references public.restaurants(restaurant_id) on delete cascade,
  sender_role text not null check (sender_role in ('restaurant', 'customer', 'driver', 'support')),
  sender_id text,
  body text not null,
  is_canned boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurant_messages_conversation
  on public.restaurant_messages (conversation_id, created_at);

create index if not exists idx_restaurant_messages_restaurant
  on public.restaurant_messages (restaurant_id, created_at desc);

alter table public.restaurant_conversations enable row level security;
alter table public.restaurant_messages enable row level security;

-- Vendor owns conversations for their restaurant
drop policy if exists restaurant_conversations_vendor on public.restaurant_conversations;
create policy restaurant_conversations_vendor on public.restaurant_conversations
  for all to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = restaurant_conversations.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = restaurant_conversations.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  );

-- Customers see conversations where they are the participant
drop policy if exists restaurant_conversations_customer on public.restaurant_conversations;
create policy restaurant_conversations_customer on public.restaurant_conversations
  for select to authenticated
  using (participant_type = 'customer' and participant_id = auth.uid()::text);

-- Drivers see conversations where they are the participant
drop policy if exists restaurant_conversations_driver on public.restaurant_conversations;
create policy restaurant_conversations_driver on public.restaurant_conversations
  for select to authenticated
  using (participant_type = 'driver' and participant_id = auth.uid()::text);

drop policy if exists restaurant_messages_vendor on public.restaurant_messages;
create policy restaurant_messages_vendor on public.restaurant_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = restaurant_messages.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = restaurant_messages.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  );

drop policy if exists restaurant_messages_participant_read on public.restaurant_messages;
create policy restaurant_messages_participant_read on public.restaurant_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.restaurant_conversations c
      where c.conversation_id = restaurant_messages.conversation_id
        and (
          (c.participant_type = 'customer' and c.participant_id = auth.uid()::text)
          or (c.participant_type = 'driver' and c.participant_id = auth.uid()::text)
        )
    )
  );

-- Admins full access
drop policy if exists restaurant_conversations_admin on public.restaurant_conversations;
create policy restaurant_conversations_admin on public.restaurant_conversations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists restaurant_messages_admin on public.restaurant_messages;
create policy restaurant_messages_admin on public.restaurant_messages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.restaurant_conversations to service_role;
grant select, insert, update, delete on public.restaurant_messages to service_role;
revoke all on public.restaurant_conversations from anon;
revoke all on public.restaurant_messages from anon;
