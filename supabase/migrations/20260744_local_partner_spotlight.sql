-- Local Partner Spotlight — additive community marketplace feature (non-breaking)

create table if not exists public.local_partner_spotlights (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(restaurant_id) on delete cascade,
  title text,
  story text,
  owner_message text,
  cover_image_url text,
  logo_url text,
  video_url text,
  featured_menu_items jsonb not null default '[]'::jsonb,
  promotion_text text,
  spotlight_tags text[] not null default '{}',
  slug text,
  homepage_featured boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'archived')),
  featured_start_date timestamptz,
  featured_end_date timestamptz,
  submitted_by text references public.users(user_id) on delete set null,
  approved_by text references public.users(user_id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_local_partner_spotlights_slug
  on public.local_partner_spotlights (slug)
  where slug is not null;

create index if not exists idx_local_partner_spotlights_restaurant
  on public.local_partner_spotlights (restaurant_id);

create index if not exists idx_local_partner_spotlights_status_dates
  on public.local_partner_spotlights (status, featured_start_date, featured_end_date)
  where status = 'published';

create table if not exists public.spotlight_media (
  id uuid primary key default gen_random_uuid(),
  spotlight_id uuid not null references public.local_partner_spotlights(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  media_url text not null,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_spotlight_media_spotlight
  on public.spotlight_media (spotlight_id, sort_order);

create table if not exists public.spotlight_analytics (
  id bigserial primary key,
  spotlight_id uuid references public.local_partner_spotlights(id) on delete set null,
  restaurant_id text,
  event_type text not null
    check (event_type in (
      'spotlight_view',
      'restaurant_page_click',
      'menu_click',
      'order_generated',
      'promotion_redemption',
      'share_click'
    )),
  user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_spotlight_analytics_spotlight
  on public.spotlight_analytics (spotlight_id, event_type, created_at desc);

create index if not exists idx_spotlight_analytics_created
  on public.spotlight_analytics (created_at desc);

create table if not exists public.spotlight_notification_preferences (
  user_id text primary key references public.users(user_id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Storage bucket for spotlight uploads
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'spotlight-media',
    'spotlight-media',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
  );
exception when others then null;
end $$;

-- RLS
alter table public.local_partner_spotlights enable row level security;
alter table public.spotlight_media enable row level security;
alter table public.spotlight_analytics enable row level security;
alter table public.spotlight_notification_preferences enable row level security;

drop policy if exists "spotlight_public_read_published" on public.local_partner_spotlights;
create policy "spotlight_public_read_published"
  on public.local_partner_spotlights for select
  using (
    status = 'published'
    and (featured_start_date is null or featured_start_date <= now())
    and (featured_end_date is null or featured_end_date >= now())
  );

drop policy if exists "spotlight_vendor_own" on public.local_partner_spotlights;
create policy "spotlight_vendor_own"
  on public.local_partner_spotlights for all
  using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = local_partner_spotlights.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = local_partner_spotlights.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  );

drop policy if exists "spotlight_media_public_read" on public.spotlight_media;
create policy "spotlight_media_public_read"
  on public.spotlight_media for select
  using (
    exists (
      select 1 from public.local_partner_spotlights s
      where s.id = spotlight_media.spotlight_id
        and s.status = 'published'
    )
  );

drop policy if exists "spotlight_media_vendor" on public.spotlight_media;
create policy "spotlight_media_vendor"
  on public.spotlight_media for all
  using (
    exists (
      select 1
      from public.local_partner_spotlights s
      join public.restaurants r on r.restaurant_id = s.restaurant_id
      where s.id = spotlight_media.spotlight_id
        and r.owner_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
      from public.local_partner_spotlights s
      join public.restaurants r on r.restaurant_id = s.restaurant_id
      where s.id = spotlight_media.spotlight_id
        and r.owner_id = auth.uid()::text
    )
  );

drop policy if exists "spotlight_prefs_own" on public.spotlight_notification_preferences;
create policy "spotlight_prefs_own"
  on public.spotlight_notification_preferences for all
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

grant select on public.local_partner_spotlights to authenticated, anon;
grant select on public.spotlight_media to authenticated, anon;
grant all on public.local_partner_spotlights to service_role;
grant all on public.spotlight_media to service_role;
grant all on public.spotlight_analytics to service_role;
grant select, insert, update on public.spotlight_notification_preferences to authenticated;
grant all on public.spotlight_notification_preferences to service_role;
grant usage, select on sequence public.spotlight_analytics_id_seq to service_role;
