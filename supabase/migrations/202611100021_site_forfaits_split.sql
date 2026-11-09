-- Forfaits « site internet » réalisés à deux :
--   Elisa : création du site seule (sans shooting) = 75 % du prix affiché sur le site
--   Alexandre : shooting photo pour le site = 25 % restants (nouvelles prestations de son catalogue)
-- Les deux parts additionnées redonnent le prix affiché (650 €, 1 200 €, 2 000 €).

update public.services
set name = 'Site essentiel — création du site',
    unit_price_cents = 48750,
    description = 'Une page ou un site simple pour présenter votre activité et vos informations clés. Comprend : échange de cadrage, direction artistique, design responsive, intégration des contenus fournis et formulaire de contact. Création du site seule (75 % du forfait Site essentiel à 650 €) ; le shooting photo pour le site fait l’objet du devis d’Alexandre Palanca.',
    updated_at = now()
where issuer = 'elisa' and name = 'Site essentiel';

update public.services
set name = 'Site vitrine — création du site',
    unit_price_cents = 90000,
    description = 'Un site multipage pour présenter en détail votre activité, vos services et vos réalisations. Comprend : architecture éditoriale, direction artistique personnalisée, pages dédiées, galerie, mise en page responsive et accompagnement à la mise en ligne. Création du site seule (75 % du forfait Site vitrine à 1 200 €) ; le shooting photo pour le site fait l’objet du devis d’Alexandre Palanca.',
    updated_at = now()
where issuer = 'elisa' and name = 'Site vitrine';

update public.services
set name = 'Site sur mesure — création du site',
    unit_price_cents = 150000,
    description = 'Une expérience entièrement pensée pour un projet aux besoins et fonctionnalités spécifiques. Comprend : atelier de conception, parcours et fonctionnalités sur mesure, univers graphique approfondi, production et suivi de projet dédiés. Création du site seule (75 % du forfait Site sur mesure à 2 000 €) ; le shooting photo pour le site fait l’objet du devis d’Alexandre Palanca.',
    updated_at = now()
where issuer = 'elisa' and name = 'Site sur mesure';

insert into public.services (issuer, name, description, unit_price_cents, unit, vat_rate_bps, category)
select 'alexandre', name, description, price, 'forfait', 0, 'Site internet' from (values
  ('Site essentiel — shooting photo pour le site',
   'Séance photo pour illustrer le site internet : sélection et retouche des images, livrées aux formats du site. Part photo du forfait Site essentiel (25 % de 650 €) ; la création du site fait l’objet du devis d’Elisa Martignac.',
   16250),
  ('Site vitrine — shooting photo pour le site',
   'Séance photo pour illustrer les pages du site vitrine : sélection et retouche des images, livrées aux formats du site. Part photo du forfait Site vitrine (25 % de 1 200 €) ; la création du site fait l’objet du devis d’Elisa Martignac.',
   30000),
  ('Site sur mesure — shooting photo pour le site',
   'Production photo pour le site sur mesure : séance(s), sélection et retouche des images, livrées aux formats du site. Part photo du forfait Site sur mesure (25 % de 2 000 €) ; la création du site fait l’objet du devis d’Elisa Martignac.',
   50000)
) as forfaits(name, description, price)
where not exists (
  select 1 from public.services s where s.issuer = 'alexandre' and s.name = forfaits.name
);
