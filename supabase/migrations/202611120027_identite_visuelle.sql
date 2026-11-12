-- Nouvelle prestation « Identité visuelle » (Elisa)
-- 1. Espace client « Identité visuelle » : dossiers de fichiers à télécharger + charte graphique en PDF
--    (même fonctionnement que les contenus réseaux).
alter table public.galleries drop constraint if exists galleries_delivery_check;
alter table public.galleries add constraint galleries_delivery_check
  check (delivery in ('photos', 'video', 'web', 'social', 'identite'));

-- 2. Formules du catalogue d'Elisa (prix de la page Identité visuelle ; « Sur mesure » se fait sur devis)
insert into public.services (issuer, name, description, unit_price_cents, unit, vat_rate_bps, category)
select 'elisa', name, description, price, 'forfait', 0, 'Identité visuelle' from (values
  ('Identité visuelle — Essentiel',
   'Les bases d’une identité visuelle cohérente : échange et recherche créative, création d’un logo principal, deux déclinaisons du logo, palette de couleurs et typographies, fichiers numériques prêts à l’emploi.',
   35000),
  ('Identité visuelle — Signature',
   'Un univers visuel complet : tout le contenu de la formule Essentiel, univers et éléments graphiques, charte graphique, déclinaison sur trois supports au choix, présentation de l’identité en situation.',
   75000)
) as formules(name, description, price)
where not exists (
  select 1 from public.services s where s.issuer = 'elisa' and s.name = formules.name
);

-- 3. Intitulé d'Elisa sur les devis et factures
update public.commerce_settings
set trade_name = 'Elisa Martignac — Webdesign, sites internet & identité visuelle', updated_at = now()
where issuer = 'elisa' and trade_name = 'Elisa Martignac — Webdesign & création de sites internet';
