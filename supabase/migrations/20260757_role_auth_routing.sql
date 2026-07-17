-- Role-driven auth routing: profiles view, role backfill, expanded signup roles

-- Readable profiles view over existing users table (no duplicate storage)
create or replace view public.profiles as
select
  user_id as id,
  auth_id as auth_user_id,
  email,
  coalesce(nullif(trim(display_name), ''), name) as name,
  coalesce(profile_photo_url, picture) as profile_photo,
  role,
  case
    when active = false then 'suspended'
    else coalesce(nullif(trim(approval_status), ''), 'approved')
  end as account_status,
  created_at,
  updated_at
from public.users;

comment on view public.profiles is 'Role-driven profile view — backed by public.users';

grant select on public.profiles to authenticated, service_role;

-- Backfill canonical role labels (idempotent)
update public.users set role = 'driver' where role = 'delivery';
update public.users set role = 'restaurant_owner' where role in ('vendor', 'restaurant');

-- Founder operators: explicit role while preserving founder_driver flags
update public.users
set role = 'founder_driver'
where role = 'admin'
  and founder_driver = true
  and is_founder = true
  and role is distinct from 'founder_driver';

-- Expand signup role normalization
create or replace function public.normalize_signup_role(raw_role text)
returns text
language plpgsql
immutable
as $$
declare
  r text := lower(coalesce(nullif(trim(raw_role), ''), 'customer'));
begin
  if r in ('driver', 'delivery') then return 'driver'; end if;
  if r in ('restaurant', 'vendor', 'restaurant_owner') then return 'restaurant_owner'; end if;
  if r in ('restaurant_staff') then return 'restaurant_staff'; end if;
  if r in ('founder_driver') then return 'founder_driver'; end if;
  if r in ('super_admin') then return 'super_admin'; end if;
  if r in ('customer', 'admin', 'dispatcher') then return r; end if;
  return 'customer';
end;
$$;

grant execute on function public.normalize_signup_role(text) to authenticated, service_role;
