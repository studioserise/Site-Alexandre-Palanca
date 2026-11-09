-- Contenus réseaux : prestation réalisée à deux, en deux devis associés.
--   Devis d'Alexandre : shooting photo & vidéo (70 % du prix de la formule)
--   Devis d'Elisa     : création digitale (30 % du prix de la formule)
-- bundle_total_cents garde le prix total de la formule pour pré-remplir le second devis.
alter table public.quotes add column if not exists bundle text check (bundle in ('reseaux'));
alter table public.quotes add column if not exists bundle_formula text not null default '';
alter table public.quotes add column if not exists bundle_total_cents integer check (bundle_total_cents >= 0);
