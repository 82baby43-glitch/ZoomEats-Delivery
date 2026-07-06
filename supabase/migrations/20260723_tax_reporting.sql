-- Patch 9: Tax & year-end reporting (W-9 storage, contractor payments, 1099 exports)

alter table public.tax_information
  add column if not exists w9_document_path text,
  add column if not exists tin_type text,
  add column if not exists status text not null default 'on_file',
  add column if not exists address_line2 text;

create table if not exists public.contractor_payments (
  payment_id text primary key,
  user_id text not null,
  entity_type text not null check (entity_type in ('driver', 'restaurant')),
  amount numeric(12, 2) not null,
  payment_type text not null default 'contractor_earnings',
  tax_year int not null,
  paid_at timestamptz not null default now(),
  reference_id text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_contractor_payments_user_year
  on public.contractor_payments (user_id, tax_year);

create index if not exists idx_contractor_payments_year
  on public.contractor_payments (tax_year, paid_at desc);

create table if not exists public.tax_year_reports (
  report_id text primary key,
  tax_year int not null,
  generated_by text,
  contractor_count int not null default 0,
  total_payments numeric(14, 2) not null default 0,
  report_1099_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tax_year_reports_year
  on public.tax_year_reports (tax_year, created_at desc);

alter table public.contractor_payments enable row level security;
alter table public.tax_year_reports enable row level security;

grant select on public.contractor_payments to authenticated;
grant all on public.contractor_payments to service_role;
grant all on public.tax_year_reports to service_role;

drop policy if exists "contractor_payments_own" on public.contractor_payments;
create policy "contractor_payments_own" on public.contractor_payments
  for select to authenticated using (user_id = auth.uid()::text);

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('tax-documents', 'tax-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
  on conflict (id) do nothing;
exception when others then
  raise notice 'tax-documents bucket skipped: %', sqlerrm;
end $$;
