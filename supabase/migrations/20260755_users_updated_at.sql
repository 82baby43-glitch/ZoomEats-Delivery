-- Profile updates and photo upload complete write users.updated_at; column was missing in production.

alter table public.users
  add column if not exists updated_at timestamptz default now();

update public.users
  set updated_at = coalesce(created_at, now())
  where updated_at is null;

alter table public.users
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();
