-- Customer agreement center: new customers must sign agreements before ordering

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

  if v_role in ('vendor', 'delivery') then
    v_approval := 'pending';
    v_agreements := false;
  elsif v_role = 'customer' then
    v_approval := 'approved';
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
    user_id, auth_id, email, name, picture, role, created_at,
    approval_status, agreement_complete, active
  )
  values (
    new.id::text, new.id, v_email, v_name, v_picture, v_role, now(),
    v_approval, v_agreements, true
  )
  on conflict (user_id) do update set
    auth_id = excluded.auth_id,
    email = excluded.email,
    name = excluded.name,
    picture = excluded.picture,
    role = case when public.users.role = 'admin' then public.users.role else excluded.role end;

  return new;
exception
  when unique_violation then
    raise log 'handle_new_user unique_violation email=% auth_id=%', v_email, new.id;
    return new;
  when others then
    raise log 'handle_new_user failed auth_id=% email=% err=%', new.id, v_email, sqlerrm;
    return new;
end;
$$;
