-- Option A pickup verification: driver confirms order + sealed bag photo before pickup

alter table public.orders
  add column if not exists pickup_confirmed_at timestamptz,
  add column if not exists pickup_photo_url text,
  add column if not exists pickup_photo_storage_path text;

comment on column public.orders.pickup_confirmed_at is 'Driver tapped I received the correct order';
comment on column public.orders.pickup_photo_storage_path is 'Storage path for required sealed-bag pickup photo';
