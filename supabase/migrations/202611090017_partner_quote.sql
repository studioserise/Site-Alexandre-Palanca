-- Devis associé à l'autre prestataire : sur un devis d'Elisa, la case « prestation photo & vidéo
-- comprise » (ou l'inverse sur un devis d'Alexandre) crée dans le centre de notifications un rappel
-- de créer le devis de l'autre, déjà pré-rempli. Le rappel s'éteint quand ce devis est créé.
alter table public.quotes add column if not exists partner_requested boolean not null default false;
alter table public.quotes add column if not exists partner_quote_id uuid references public.quotes (id) on delete set null;
create index if not exists quotes_partner_idx on public.quotes (partner_quote_id);
