-- ZoomEats: connect Supabase Auth + grant client access (run in Supabase SQL Editor)
-- Project: njrrhckegbfqhwkqkzvw

-- 1. Link auth.users → public.users
alter table public.users add column if not exists auth_id uuid references auth.users(id) on delete cascade;

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
  on conflict (user_id) do update set
    auth_id = excluded.auth_id,
    email = excluded.email,
    name = excluded.name,
    picture = excluded.picture;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Grant table access to Supabase client roles (required alongside RLS policies)
grant usage on schema public to anon, authenticated;

grant select on public.restaurants to anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant select, insert, update on public.users to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;
grant select, insert, update on public.restaurants to authenticated;
grant select, insert, update on public.drivers to authenticated;
grant select on public.deliveries to authenticated;
grant select, insert on public.chat_messages to authenticated;

-- wallets tables are optional (not in legacy schema); skip if absent

-- 3. Enable RLS
alter table public.users enable row level security;
alter table public.restaurants enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.drivers enable row level security;
alter table public.deliveries enable row level security;
alter table public.chat_messages enable row level security;

-- 4. Drop old deny-all policies if re-running
drop policy if exists "public_read_restaurants" on public.restaurants;
drop policy if exists "public_read_menu" on public.menu_items;
drop policy if exists "users_read_own" on public.users;
drop policy if exists "users_update_own" on public.users;
drop policy if exists "users_insert_own" on public.users;
drop policy if exists "orders_customer_read" on public.orders;
drop policy if exists "orders_customer_insert" on public.orders;
drop policy if exists "vendor_restaurant" on public.restaurants;
drop policy if exists "vendor_menu" on public.menu_items;
drop policy if exists "vendor_orders_read" on public.orders;
drop policy if exists "driver_own" on public.drivers;
drop policy if exists "chat_own" on public.chat_messages;

-- 5. Create policies
create policy "public_read_restaurants" on public.restaurants
  for select to anon, authenticated using (approved = true);

create policy "public_read_menu" on public.menu_items
  for select to anon, authenticated using (
    exists (select 1 from public.restaurants r where r.restaurant_id = menu_items.restaurant_id and r.approved = true)
  );

create policy "users_read_own" on public.users
  for select to authenticated using (auth.uid()::text = user_id or auth.uid() = auth_id);

create policy "users_update_own" on public.users
  for update to authenticated using (auth.uid()::text = user_id or auth.uid() = auth_id);

create policy "users_insert_own" on public.users
  for insert to authenticated with check (auth.uid()::text = user_id);

create policy "orders_customer_read" on public.orders
  for select to authenticated using (
    customer_id = auth.uid()::text
    or delivery_partner_id = auth.uid()::text
    or exists (select 1 from public.restaurants r where r.restaurant_id = orders.restaurant_id and r.owner_id = auth.uid()::text)
  );

create policy "orders_customer_insert" on public.orders
  for insert to authenticated with check (customer_id = auth.uid()::text);

create policy "vendor_restaurant" on public.restaurants
  for all to authenticated using (owner_id = auth.uid()::text);

create policy "vendor_menu" on public.menu_items
  for all to authenticated using (
    exists (select 1 from public.restaurants r where r.restaurant_id = menu_items.restaurant_id and r.owner_id = auth.uid()::text)
  );

create policy "vendor_orders_read" on public.orders
  for select to authenticated using (
    exists (select 1 from public.restaurants r where r.restaurant_id = orders.restaurant_id and r.owner_id = auth.uid()::text)
    or (status = 'ready' and delivery_partner_id is null)
  );

create policy "driver_own" on public.drivers
  for all to authenticated using (user_id = auth.uid()::text);

create policy "chat_own" on public.chat_messages
  for all to authenticated using (user_id = auth.uid()::text);
