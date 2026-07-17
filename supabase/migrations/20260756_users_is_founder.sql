-- Primary founder account flag (additive; does not change permanent role)
alter table public.users
  add column if not exists is_founder boolean not null default false;

comment on column public.users.is_founder is 'Primary ZoomEats founder — may use Founder Driver Mode without delivery role';

-- Grant founder flag to admins who already have founder_driver (safe, idempotent)
update public.users
set is_founder = true
where founder_driver = true
  and is_founder is distinct from true;
