-- ZoomEats: Authorization audit + driver/restaurant compliance (non-breaking additive)

-- ---- Users compliance ----
alter table public.users
  add column if not exists approval_status text not null default 'approved',
  add column if not exists agreement_complete boolean not null default true,
  add column if not exists active boolean not null default true,
  add column if not exists suspended_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists onboarding_role text;

comment on column public.users.approval_status is 'pending | documents_missing | review | approved | rejected | suspended';
comment on column public.users.onboarding_role is 'Role selected during onboarding (customer|vendor|delivery|dispatcher)';

-- Customers/admins default approved; delivery/vendor get pending on role select via API

-- ---- Drivers compliance ----
alter table public.drivers
  add column if not exists approval_status text not null default 'pending',
  add column if not exists agreement_complete boolean not null default false,
  add column if not exists active boolean not null default true,
  add column if not exists suspended_at timestamptz,
  add column if not exists documents_complete boolean not null default false,
  add column if not exists updated_at timestamptz default now();

-- ---- Restaurants compliance (align with existing approved/active) ----
alter table public.restaurants
  add column if not exists approval_status text,
  add column if not exists agreement_complete boolean not null default false;

update public.restaurants
set approval_status = case when approved = true then 'approved' else 'pending' end
where approval_status is null;

alter table public.restaurants
  alter column approval_status set default 'pending';

update public.restaurants set approval_status = 'pending' where approval_status is null;
alter table public.restaurants alter column approval_status set not null;

-- ---- Agreement acceptances ----
create table if not exists public.agreement_acceptances (
  acceptance_id text primary key,
  user_id text not null,
  agreement_type text not null,
  agreement_version text not null default '1.0',
  accepted_at timestamptz not null default now(),
  signature text,
  typed_name text,
  consent_checkbox boolean not null default false,
  ip_address text,
  device text,
  browser text,
  user_agent text,
  metadata jsonb default '{}'::jsonb
);

alter table public.agreement_acceptances
  add column if not exists role_context text,
  add column if not exists user_id text,
  add column if not exists agreement_type text,
  add column if not exists agreement_version text default '1.0',
  add column if not exists accepted_at timestamptz default now(),
  add column if not exists signature text,
  add column if not exists typed_name text,
  add column if not exists consent_checkbox boolean default false,
  add column if not exists ip_address text,
  add column if not exists device text,
  add column if not exists browser text,
  add column if not exists user_agent text,
  add column if not exists metadata jsonb default '{}'::jsonb;

update public.agreement_acceptances set role_context = 'delivery' where role_context is null;

alter table public.agreement_acceptances alter column role_context set default 'delivery';
alter table public.agreement_acceptances alter column role_context set not null;

create unique index if not exists idx_agreement_acceptances_unique
  on public.agreement_acceptances (user_id, agreement_type, agreement_version);

create index if not exists idx_agreement_acceptances_user
  on public.agreement_acceptances (user_id, role_context);

-- ---- Documents ----
create table if not exists public.driver_documents (
  document_id text primary key,
  user_id text not null,
  document_type text not null,
  file_url text,
  file_key text,
  status text not null default 'pending',
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  notes text
);

create index if not exists idx_driver_documents_user on public.driver_documents (user_id);

create table if not exists public.restaurant_documents (
  document_id text primary key,
  restaurant_id text not null,
  document_type text not null,
  file_url text,
  file_key text,
  status text not null default 'pending',
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  notes text
);

create index if not exists idx_restaurant_documents_restaurant
  on public.restaurant_documents (restaurant_id);

-- ---- Compliance reviews queue ----
create table if not exists public.compliance_reviews (
  review_id text primary key,
  user_id text not null,
  entity_type text not null,
  entity_id text,
  status text not null default 'pending',
  approval_status text not null default 'review',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz
);

alter table public.compliance_reviews
  add column if not exists approval_status text default 'review',
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_compliance_reviews_status
  on public.compliance_reviews (status, created_at desc);

-- ---- Audit logs ----
create table if not exists public.audit_logs (
  log_id text primary key,
  event_type text not null,
  user_id text,
  actor_id text,
  entity_type text,
  entity_id text,
  severity text not null default 'info',
  message text,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_user on public.audit_logs (user_id, created_at desc);
create index if not exists idx_audit_logs_event on public.audit_logs (event_type, created_at desc);

-- Grandfather existing production drivers/restaurants (non-breaking)
update public.drivers
set agreement_complete = true, approval_status = 'approved'
where last_seen is not null or availability = true;

update public.restaurants
set agreement_complete = true
where approved = true;

-- ---- RLS ----
alter table public.agreement_acceptances enable row level security;
alter table public.driver_documents enable row level security;
alter table public.restaurant_documents enable row level security;
alter table public.compliance_reviews enable row level security;
alter table public.audit_logs enable row level security;

grant select, insert on public.agreement_acceptances to authenticated;
grant select, insert, update on public.driver_documents to authenticated;
grant select, insert, update on public.restaurant_documents to authenticated;
grant select on public.compliance_reviews to authenticated;
grant all on public.agreement_acceptances to service_role;
grant all on public.driver_documents to service_role;
grant all on public.restaurant_documents to service_role;
grant all on public.compliance_reviews to service_role;
grant all on public.audit_logs to service_role;

drop policy if exists "agreements_own" on public.agreement_acceptances;
create policy "agreements_own" on public.agreement_acceptances
  for all to authenticated using (user_id = auth.uid()::text);

drop policy if exists "driver_docs_own" on public.driver_documents;
create policy "driver_docs_own" on public.driver_documents
  for all to authenticated using (user_id = auth.uid()::text);

drop policy if exists "restaurant_docs_vendor" on public.restaurant_documents;
create policy "restaurant_docs_vendor" on public.restaurant_documents
  for all to authenticated using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = restaurant_documents.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  );

drop policy if exists "compliance_reviews_own" on public.compliance_reviews;
create policy "compliance_reviews_own" on public.compliance_reviews
  for select to authenticated using (user_id = auth.uid()::text);
