-- OpenStreetMap bulk import — osm_place_id dedup + import log provider

alter table public.restaurants
  add column if not exists osm_place_id text;

create unique index if not exists idx_restaurants_osm_place_id
  on public.restaurants (osm_place_id)
  where osm_place_id is not null;

alter table public.restaurant_import_logs
  add column if not exists provider text not null default 'google';
