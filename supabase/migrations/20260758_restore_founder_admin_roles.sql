-- Restore admin dashboard access for founder operators.
-- Founder Driver Mode is additive (founder_driver / is_founder flags), not a replacement for admin.

-- Revert mistaken founder_driver role back to admin
update public.users
set role = 'admin'
where role = 'founder_driver'
  and (is_founder = true or founder_driver = true);

-- Primary founder account: restore full admin access
update public.users
set
  role = 'admin',
  approval_status = 'approved',
  agreement_complete = true,
  active = true,
  founder_driver = true,
  is_founder = true,
  founder_driver_role = coalesce(founder_driver_role, 'founder')
where lower(email) = 'missouriboy41@gmail.com';

-- Any other primary founders should also be admin (idempotent)
update public.users
set
  role = 'admin',
  approval_status = coalesce(nullif(trim(approval_status), ''), 'approved'),
  agreement_complete = true,
  active = true
where is_founder = true
  and role is distinct from 'admin'
  and role is distinct from 'super_admin';
