-- Advanced electronic signatures: draw/upload, initials, scroll-read, signed PDF archive

alter table public.agreement_acceptances
  add column if not exists signature_method text,
  add column if not exists initials text,
  add column if not exists scroll_read_at timestamptz,
  add column if not exists signature_image_path text,
  add column if not exists signed_pdf_path text;

comment on column public.agreement_acceptances.signature_method is 'typed | draw | upload';
comment on column public.agreement_acceptances.scroll_read_at is 'When user scrolled to end of agreement body';

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'signed-agreements',
    'signed-agreements',
    false,
    20971520,
    array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  )
  on conflict (id) do nothing;
exception when others then
  raise notice 'signed-agreements bucket skipped: %', sqlerrm;
end $$;
