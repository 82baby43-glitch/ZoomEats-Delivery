-- AI Restaurant Media: menu photo enhancements with original + menu-ready versions

create table if not exists public.menu_photo_enhancements (
  enhancement_id text primary key,
  restaurant_id text not null,
  user_id text not null,
  original_path text not null,
  enhanced_path text,
  published_path text,
  published_url text,
  menu_item_id text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'enhanced', 'approved', 'rejected')),
  approved boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists idx_menu_photo_enhancements_restaurant
  on public.menu_photo_enhancements (restaurant_id, created_at desc);

create index if not exists idx_menu_photo_enhancements_status
  on public.menu_photo_enhancements (restaurant_id, status);

alter table public.menu_photo_enhancements enable row level security;

grant select, insert, update on public.menu_photo_enhancements to authenticated;
grant all on public.menu_photo_enhancements to service_role;

drop policy if exists "menu_enhancements_own" on public.menu_photo_enhancements;
create policy "menu_enhancements_own" on public.menu_photo_enhancements
  for all to authenticated using (user_id = auth.uid()::text);

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'restaurant-media',
    'restaurant-media',
    true,
    15728640,
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do nothing;
exception when others then
  raise notice 'restaurant-media bucket skipped: %', sqlerrm;
end $$;
