-- Restore hardened auth signup trigger (production was still on legacy handle_new_user).

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_picture text;
  v_role text;
  v_approval text;
  v_agreements boolean;
begin
  v_email := coalesce(nullif(trim(new.email), ''), new.id::text || '@users.zoomeats.local');

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(v_email, '@', 1),
    'User'
  );

  v_picture := coalesce(
    nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data->>'picture'), ''),
    ''
  );

  v_role := public.normalize_signup_role(new.raw_user_meta_data->>'role');

  if v_role in ('restaurant_owner', 'driver', 'restaurant_staff') then
    v_approval := 'pending';
    v_agreements := false;
  else
    v_approval := 'approved';
    v_agreements := true;
  end if;

  delete from public.users
  where lower(trim(email)) = lower(trim(v_email))
    and user_id <> new.id::text
    and auth_id is null;

  insert into public.users (
    user_id,
    auth_id,
    email,
    name,
    picture,
    role,
    created_at,
    approval_status,
    agreement_complete,
    active
  )
  values (
    new.id::text,
    new.id,
    v_email,
    v_name,
    v_picture,
    v_role,
    now(),
    v_approval,
    v_agreements,
    true
  )
  on conflict (user_id) do update set
    auth_id = excluded.auth_id,
    email = excluded.email,
    name = excluded.name,
    picture = excluded.picture,
    role = case
      when public.users.role = 'admin' then public.users.role
      else excluded.role
    end;

  return new;
exception
  when unique_violation then
    raise log 'handle_new_user unique_violation email=% auth_id=%', v_email, new.id;
    raise exception using
      errcode = '23505',
      message = 'profile_email_conflict',
      detail = format('Email %s is already registered', v_email);
  when others then
    raise log 'handle_new_user failed auth_id=% email=% err=%', new.id, v_email, sqlerrm;
    raise;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant execute on function public.normalize_signup_role(text) to authenticated, service_role;
