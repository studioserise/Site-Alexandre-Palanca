-- Devis signé en ligne par le client : PDF signé archivé (preuve d'acceptation).
alter table public.quotes add column if not exists signed_pdf_path text;
alter table public.quotes add column if not exists signed_at timestamptz;
