-- Catalogue de prestations par défaut (formules du site), seulement si le catalogue est encore vide.
-- Micro-entreprise en franchise de TVA : TVA à 0 % et mention « art. 293 B du CGI ».
-- Prix = prix « à partir de » du site, modifiables ensuite dans la gestion commerciale.
insert into public.services (name, description, unit_price_cents, unit, vat_rate_bps, category)
select * from (values
  ('L’instant — séance photo essentielle',
   'Séance photo d’environ 1 h pour une sélection d’images naturelles et soignées. Comprend : échange préparatoire, séance photo, sélection et retouche des images, galerie privée de livraison.',
   12000, 'forfait', 0, 'Photo'),
  ('L’empreinte — séance photo signature',
   'Séance approfondie de 2 à 3 h pour explorer plusieurs ambiances et créer une série d’images cohérente. Comprend : échange préparatoire, repérage et préparation, séance photo, sélection et retouche des images, galerie privée pour partager les images.',
   20000, 'forfait', 0, 'Photo'),
  ('Le récit — reportage photo sur mesure',
   'Reportage photographique construit autour de votre activité ou de votre évènement, de quelques heures à une journée. Comprend : brief et intentions visuelles, préparation et repérage, reportage, sélection et retouche des images, galerie privée de livraison.',
   25000, 'forfait', 0, 'Photo'),
  ('La captation — tournage vidéo',
   'Tournage ciblé pour obtenir des séquences vidéo prêtes à être exploitées (environ une demi-journée). Comprend : préparation technique, tournage sur site, prise de son selon les besoins, sélection et organisation des séquences, livraison des fichiers vidéo bruts.',
   25000, 'forfait', 0, 'Vidéo'),
  ('Le film — tournage et montage',
   'Tournage accompagné d’un montage soigné pour un film prêt à diffuser (environ une demi-journée de tournage). Comprend : échange préparatoire, tournage sur site, sélection des séquences, montage et étalonnage, livraison du film final.',
   45000, 'forfait', 0, 'Vidéo'),
  ('La production — réalisation audiovisuelle',
   'Réalisation complète, de la conception aux déclinaisons finales (une à plusieurs journées). Comprend : conception et écriture des intentions, organisation de la production, tournage, montage et étalonnage, déclinaisons convenues, livraison. Montant à définir selon le projet.',
   0, 'forfait', 0, 'Vidéo'),
  ('Option — prises de vues aériennes (drone)',
   'Images aériennes en complément d’un reportage photo ou d’un film, selon les possibilités du site et les conditions de vol. Tarif à définir.',
   0, 'forfait', 0, 'Options'),
  ('Option — retouche avancée',
   'Retouche approfondie au-delà de la retouche incluse (peau, objets indésirables, montage…). Tarif à définir.',
   0, 'photo', 0, 'Options'),
  ('Frais de déplacement',
   'Déplacement au-delà de la zone d’intervention habituelle. Tarif à définir.',
   0, 'forfait', 0, 'Options')
) as defaults(name, description, unit_price_cents, unit, vat_rate_bps, category)
where not exists (select 1 from public.services);

update public.commerce_settings
set vat_mention = 'TVA non applicable, art. 293 B du CGI'
where id = 1 and coalesce(vat_mention, '') = '';
