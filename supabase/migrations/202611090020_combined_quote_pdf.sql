-- Proposition commune (devis d'Alexandre + devis d'Elisa pour un même projet) :
-- un seul PDF de 3 pages (synthèse + les deux devis), disponible une fois les deux devis validés.
alter table public.quotes add column if not exists combined_pdf_path text;
alter table public.quotes add column if not exists combined_sent_at timestamptz;
