-- ZoomEats — Agreement Center, Compliance & Second Chance Review schema.
-- Additive only. All access goes through the service-role backend (/api/backend),
-- so RLS is enabled with no anon/authenticated policies (deny direct client access),
-- matching the existing ZoomEats security posture.

-- ---------------------------------------------------------------------------
-- Agreement catalog (current published version per agreement type)
-- ---------------------------------------------------------------------------
create table if not exists public.agreements (
  agreement_type text primary key,
  name           text not null,
  version        text not null default 'v1',
  body           text,
  required_for   text[] not null default array['all'],
  published      boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- Electronic acceptance / signature records (immutable history)
create table if not exists public.agreement_acceptances (
  acceptance_id      text primary key,
  user_id            text not null,
  user_type          text,
  agreement_type     text not null,
  agreement_version  text not null,
  accepted_at        timestamptz not null default now(),
  status             text not null default 'accepted',
  ip_address         text,
  device_info        text,
  typed_name         text,
  acceptance_method  text not null default 'typed_name+checkbox',
  signature_metadata jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists ix_acceptances_user on public.agreement_acceptances(user_id);

-- ---------------------------------------------------------------------------
-- Compliance status per user
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_records (
  compliance_id text primary key,
  user_id       text not null unique,
  user_type     text,
  status        text not null default 'active',  -- active|warning|under_review|suspended|reinstated|removed
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Criminal history disclosure (driver onboarding)
-- ---------------------------------------------------------------------------
create table if not exists public.driver_disclosures (
  disclosure_id    text primary key,
  user_id          text not null,
  has_conviction   boolean not null default false,
  offense_type     text,
  severity         text,                          -- felony|misdemeanor
  conviction_date  date,
  state            text,
  explanation      text,
  rehabilitation   text,
  additional_notes text,
  created_at       timestamptz not null default now()
);
create index if not exists ix_disclosures_user on public.driver_disclosures(user_id);

-- ---------------------------------------------------------------------------
-- Second Chance Review queue
-- ---------------------------------------------------------------------------
create table if not exists public.second_chance_reviews (
  review_id              text primary key,
  user_id                text not null,
  disclosure_id          text,
  offense_type           text,
  severity               text,
  conviction_date        date,
  years_since_conviction numeric,
  state                  text,
  status                 text not null default 'pending_review',
  -- application_submitted|pending_review|compliance_review|second_chance_review|
  -- more_info_requested|approved|rejected|active
  reviewer_id            text,
  decision               text,
  notes                  jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists ix_scr_status on public.second_chance_reviews(status);

-- ---------------------------------------------------------------------------
-- Secure document references (files live in the 'compliance-docs' storage bucket)
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_documents (
  doc_id        text primary key,
  user_id       text,
  review_id     text,
  disclosure_id text,
  bucket        text not null default 'compliance-docs',
  key           text not null,
  filename      text,
  content_type  text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Compliance investigations
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_investigations (
  investigation_id  text primary key,
  user_id           text,
  investigation_type text,
  report_date       timestamptz not null default now(),
  investigator      text,
  evidence          jsonb not null default '[]'::jsonb,
  notes             text,
  status            text not null default 'open',  -- open|pending|closed|escalated
  resolution        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Immutable (append-only) audit log
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_audit_log (
  id             bigint generated always as identity primary key,
  ts             timestamptz not null default now(),
  user_id        text,
  reviewer_id    text,
  action_type    text not null,
  entity         text,
  entity_id      text,
  previous_value jsonb,
  new_value      jsonb,
  metadata       jsonb
);
create index if not exists ix_audit_user on public.compliance_audit_log(user_id);
create index if not exists ix_audit_entity on public.compliance_audit_log(entity, entity_id);

create or replace function public.compliance_audit_no_modify()
returns trigger language plpgsql as $$
begin
  raise exception 'compliance_audit_log is append-only; % is not permitted', tg_op;
end;
$$;
drop trigger if exists trg_compliance_audit_no_modify on public.compliance_audit_log;
create trigger trg_compliance_audit_no_modify
  before update or delete on public.compliance_audit_log
  for each row execute function public.compliance_audit_no_modify();

-- ---------------------------------------------------------------------------
-- RLS: enable everywhere, deny anon/authenticated (service-role backend only)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'agreements','agreement_acceptances','compliance_records','driver_disclosures',
    'second_chance_reviews','compliance_documents','compliance_investigations','compliance_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('revoke all on public.%I from authenticated;', t);
    -- The backend connects as service_role (bypasses RLS) and needs table grants.
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end$$;

-- Public read of the agreement catalog (names/versions are not sensitive)
grant select on public.agreements to anon, authenticated;
drop policy if exists "public_read_agreements" on public.agreements;
create policy "public_read_agreements" on public.agreements
  for select to anon, authenticated using (published = true);

-- ---------------------------------------------------------------------------
-- Seed the required agreement catalog
-- ---------------------------------------------------------------------------
insert into public.agreements (agreement_type, name, version, required_for, body) values
  ('terms', 'Terms of Service', 'v1', array['all'],
   'ZoomEats Terms of Service. By accepting you agree to the platform terms governing use of the ZoomEats marketplace.'),
  ('privacy', 'Privacy Policy', 'v1', array['all'],
   'ZoomEats Privacy Policy describing how personal data is collected, used, and protected.'),
  ('electronic_records', 'Electronic Records Consent', 'v1', array['all'],
   'You consent to the use of electronic records and electronic signatures for all agreements and communications.'),
  ('electronic_communications', 'Electronic Communications Consent', 'v1', array['all'],
   'You consent to receive communications electronically, including notices and disclosures.'),
  ('data_usage', 'Data Usage Policy', 'v1', array['all'],
   'Describes how ZoomEats uses platform and order data to operate and improve the service.'),
  ('sms_consent', 'SMS Communication Consent', 'v1', array['all'],
   'You consent to receive transactional SMS messages related to your account and orders.'),
  ('driver_agreement', 'Driver Independent Contractor Agreement', 'v1', array['delivery'],
   'Driver operates as an independent contractor controlling their own schedule, providing their own vehicle and insurance, and responsible for their own taxes. ZoomEats operates as a technology marketplace platform. Driver agrees to maintain a valid license and required insurance, follow applicable laws, deliver professionally, protect customer information, and follow food-safety practices. Prohibited conduct includes theft, fraud, harassment, violence, delivery tampering, impaired driving, customer abuse, identity fraud, account sharing, and platform manipulation. Second Chance Clause: ZoomEats LLC believes in fair opportunity participation and may consider applicants with prior felony or misdemeanor convictions through an individualized review process. Approval is not guaranteed and remains subject to safety, compliance, operational, and legal review.'),
  ('restaurant_agreement', 'Restaurant Partner Agreement', 'v1', array['vendor'],
   'Restaurant certifies possession of required licenses, compliance with health and food-safety regulations, accurate menu, pricing and hours, and authority to sell listed products. Restaurant agrees to prepare food safely, maintain quality standards, keep menu information updated, maintain permits, comply with regulations, and cooperate with investigations.')
on conflict (agreement_type) do nothing;
