-- Menu AI image enhancements — Photoroom integration (additive, non-breaking)

create table if not exists public.restaurant_menu_enhancements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(restaurant_id) on delete cascade,
  preset text not null default 'clean_bright',
  original_storage_path text not null,
  enhanced_storage_path text not null,
  created_by text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurant_menu_enhancements_restaurant
  on public.restaurant_menu_enhancements (restaurant_id, created_at desc);

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'menu-images',
    'menu-images',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  );
exception when others then null;
end $$;

alter table public.restaurant_menu_enhancements enable row level security;

drop policy if exists "menu_enhancements_vendor_read" on public.restaurant_menu_enhancements;
create policy "menu_enhancements_vendor_read"
  on public.restaurant_menu_enhancements for select
  using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = restaurant_menu_enhancements.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  );

grant select on public.restaurant_menu_enhancements to authenticated;
grant all on public.restaurant_menu_enhancements to service_role;
