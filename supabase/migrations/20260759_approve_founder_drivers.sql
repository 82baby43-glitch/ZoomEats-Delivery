-- Approve founder driver profiles for launch audit and Founder Driver Mode.
-- Founders/admins with driver rows should not block on partner approval queue.

update public.drivers d
set
  approval_status = 'approved',
  agreement_complete = true,
  active = true,
  updated_at = now()
from public.users u
where d.user_id = u.user_id
  and (u.is_founder = true or u.founder_driver = true)
  and d.approval_status is distinct from 'approved';

update public.compliance_reviews cr
set
  status = 'approved',
  approval_status = 'approved',
  reviewed_at = coalesce(cr.reviewed_at, now()),
  updated_at = now()
from public.users u
where cr.user_id = u.user_id
  and (u.is_founder = true or u.founder_driver = true)
  and cr.entity_type = 'driver'
  and cr.status is distinct from 'approved';
