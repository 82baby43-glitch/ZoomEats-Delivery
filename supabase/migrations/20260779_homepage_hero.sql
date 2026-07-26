-- Admin-controlled homepage hero featured store

create table if not exists public.homepage_hero (
  id text primary key default 'default',
  enabled boolean not null default false,
  restaurant_id text references public.restaurants(restaurant_id) on delete set null,
  image_url text,
  image_storage_path text,
  use_restaurant_image boolean not null default true,
  updated_by text references public.users(user_id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.homepage_hero (id, enabled)
values ('default', false)
on conflict (id) do nothing;

comment on table public.homepage_hero is 'Singleton config for the landing page hero featured store/image.';

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'hero-images',
    'hero-images',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  )
  on conflict (id) do nothing;
exception
  when others then null;
end $$;

alter table public.homepage_hero enable row level security;

drop policy if exists homepage_hero_public_read on public.homepage_hero;
create policy homepage_hero_public_read on public.homepage_hero
  for select using (true);

drop policy if exists homepage_hero_admin_write on public.homepage_hero;
create policy homepage_hero_admin_write on public.homepage_hero
  for all using (
    exists (
      select 1 from public.users u
      where u.user_id = auth.uid()::text
        and u.role = 'admin'
    )
  );
