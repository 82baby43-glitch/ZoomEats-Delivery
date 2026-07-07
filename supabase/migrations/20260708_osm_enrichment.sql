-- OSM enrichment — import source tracking

alter table public.restaurants
  add column if not exists import_source text;

create index if not exists idx_restaurants_import_source
  on public.restaurants (import_source)
  where import_source is not null;

update public.restaurants
set import_source = 'osm'
where import_source is null and osm_place_id is not null;

update public.restaurants
set import_source = 'google'
where import_source is null and google_place_id is not null;
