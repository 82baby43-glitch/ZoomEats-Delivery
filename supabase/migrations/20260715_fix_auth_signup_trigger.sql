-- Fix "Database error saving new user" — hardened auth trigger + legacy profile repair
-- Root cause: UNIQUE(email) on public.users + orphan seed rows blocked handle_new_user INSERT

-- ---- 1. Repair legacy user_id / auth_id mismatches (FK-safe) ----
do $$
declare
  r record;
begin
  for r in
    select u.user_id as old_id, a.id::text as new_id
    from public.users u
    join auth.users a on lower(trim(u.email)) = lower(trim(a.email))
    where u.user_id <> a.id::text
      and u.email is not null
      and trim(u.email) <> ''
  loop
    update public.orders set customer_id = r.new_id where customer_id = r.old_id;
    update public.orders set delivery_partner_id = r.new_id where delivery_partner_id = r.old_id;
    update public.drivers set user_id = r.new_id where user_id = r.old_id;
    update public.restaurants set owner_id = r.new_id where owner_id = r.old_id;
    update public.user_sessions set user_id = r.new_id where user_id = r.old_id;
    update public.agreement_acceptances set user_id = r.new_id where user_id = r.old_id;
    update public.compliance_reviews set user_id = r.new_id where user_id = r.old_id;
    update public.driver_documents set user_id = r.new_id where user_id = r.old_id;
    update public.audit_logs set user_id = r.new_id where user_id = r.old_id;
    update public.audit_logs set actor_id = r.new_id where actor_id = r.old_id;
    update public.users set user_id = r.new_id, auth_id = r.new_id::uuid where user_id = r.old_id;
    raise notice 'migrated user_id % -> %', r.old_id, r.new_id;
  end loop;
end $$;

-- ---- 2. Link auth_id on rows that have matching user_id but null auth_id ----
update public.users u
set auth_id = a.id
from auth.users a
where u.auth_id is null
  and u.user_id = a.id::text;

-- ---- 3. Hardened signup trigger ----
create or replace function public.normalize_signup_role(raw_role text)
returns text
language plpgsql
immutable
as $$
declare
  r text := lower(coalesce(nullif(trim(raw_role), ''), 'customer'));
begin
  if r in ('driver') then return 'delivery'; end if;
  if r in ('restaurant') then return 'vendor'; end if;
  if r in ('customer', 'vendor', 'delivery', 'admin', 'dispatcher') then return r; end if;
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
  -- Never insert empty email (breaks UNIQUE index when multiple phone/anonymous users)
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
  else
    v_approval := 'approved';
    v_agreements := true;
  end if;

  -- Orphan seed/test profiles (no auth link) block UNIQUE(email) — remove before insert
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
  begin
    -- Email already owned by a linked account with different user_id — surface clear failure
    raise log 'handle_new_user unique_violation email=% auth_id=%', v_email, new.id;
    raise exception using
      errcode = '23505',
      message = 'profile_email_conflict',
      detail = format('Email %s is already registered', v_email);
  end;
  when others then
    raise log 'handle_new_user failed auth_id=% email=% err=%', new.id, v_email, sqlerrm;
    raise;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- 4. Signup audit log helper (service_role + trigger via security definer) ----
create or replace function public.log_auth_event(
  p_event_type text,
  p_user_id text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (log_id, event_type, user_id, severity, message, metadata, created_at)
  values (
    'aud_' || replace(gen_random_uuid()::text, '-', ''),
    p_event_type,
    p_user_id,
    'info',
    p_message,
    p_metadata,
    now()
  );
exception when others then
  raise log 'log_auth_event skipped: %', sqlerrm;
end;
$$;

grant execute on function public.normalize_signup_role(text) to authenticated, service_role;
grant execute on function public.log_auth_event(text, text, text, jsonb) to service_role;

-- ---- 5. RLS: allow service_role full access (trigger runs as definer/owner) ----
-- Ensure authenticated users can still insert own row via ensureUserProfile fallback
drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert to authenticated
  with check (auth.uid()::text = user_id or auth.uid() = auth_id);

drop policy if exists "users_read_own" on public.users;
create policy "users_read_own" on public.users
  for select to authenticated
  using (auth.uid()::text = user_id or auth.uid() = auth_id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update to authenticated
  using (auth.uid()::text = user_id or auth.uid() = auth_id);
