-- Supabase Auth integration + RLS policies for ZoomEats (Next.js + Supabase only)
-- Links auth.users to public.users and enables row-level access for authenticated clients.

-- Add auth_id column if migrating from legacy user_id format
alter table public.users add column if not exists auth_id uuid references auth.users(id) on delete cascade;

-- Sync auth.users → public.users on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (user_id, auth_id, email, name, picture, role, created_at)
  values (
    new.id::text,
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    'customer',
    now()
  )
  on conflict (email) do update set
    user_id = excluded.user_id,
    auth_id = excluded.auth_id,
    name = excluded.name,
    picture = excluded.picture;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Drop deny-all RLS and replace with role-based policies
do $$
declare t text;
begin
  foreach t in array array[
    'users','restaurants','menu_items','orders',
    'payment_transactions','chat_messages','drivers','deliveries',
    'wallets','wallet_transactions'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end$$;

-- Public read: approved restaurants + menu
create policy "public_read_restaurants" on public.restaurants
  for select using (approved = true);

create policy "public_read_menu" on public.menu_items
  for select using (
    exists (select 1 from public.restaurants r where r.restaurant_id = menu_items.restaurant_id and r.approved = true)
  );

-- Users: read/update own profile
create policy "users_read_own" on public.users
  for select using (auth.uid()::text = user_id or auth.uid() = auth_id);

create policy "users_update_own" on public.users
  for update using (auth.uid()::text = user_id or auth.uid() = auth_id);

-- Orders: customers see own orders
create policy "orders_customer_read" on public.orders
  for select using (customer_id = auth.uid()::text);

create policy "orders_customer_insert" on public.orders
  for insert with check (customer_id = auth.uid()::text);

-- Vendors: manage own restaurant
create policy "vendor_restaurant" on public.restaurants
  for all using (owner_id = auth.uid()::text);

create policy "vendor_menu" on public.menu_items
  for all using (
    exists (select 1 from public.restaurants r where r.restaurant_id = menu_items.restaurant_id and r.owner_id = auth.uid()::text)
  );

-- Drivers
create policy "driver_own" on public.drivers
  for all using (user_id = auth.uid()::text);

-- Chat messages: own sessions
create policy "chat_own" on public.chat_messages
  for all using (user_id = auth.uid()::text);

-- Service role bypasses RLS (used by Edge Functions)
