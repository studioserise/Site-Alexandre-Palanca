-- Sites internet réalisés à deux, comme les contenus réseaux :
--   devis d'Elisa (création du site, 75 % du forfait) + devis d'Alexandre (shooting photo pour le site, 25 %).
alter table public.quotes drop constraint if exists quotes_bundle_check;
alter table public.quotes add constraint quotes_bundle_check check (bundle in ('reseaux', 'site'));
