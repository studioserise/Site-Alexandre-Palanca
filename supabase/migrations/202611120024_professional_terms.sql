-- Mise en conformité des devis et factures (audit du 12/11/2026)
-- - Adresse professionnelle commune des deux prestataires.
-- - Prestations réservées aux professionnels, conditions générales publiées sur le site.
-- - Clause d'annulation d'Alexandre rendue certaine (plus de « pourra être versé »), comme dans ses CGPS.
-- - Elisa : plus de renvoi au droit de rétractation des consommateurs (clientèle professionnelle).

update public.commerce_settings
set address = '41 avenue de la Gare',
    postal_code = '24200',
    city = 'Sarlat-la-Canéda',
    updated_at = now();

update public.commerce_settings
set legal_footer = 'Entrepreneur individuel (micro-entrepreneur) — SIRET 993 696 665 00013. Prestations réservées aux professionnels. Conditions générales de prestation : alexandrepalanca.fr/conditions-generales',
    default_cancellation_terms = 'Toute annulation doit être communiquée par écrit. En cas d’annulation par le client plus de 72 h avant la prestation, 50 % de l’acompte versé est remboursé. En cas d’annulation moins de 72 h avant la prestation, l’acompte versé reste acquis au prestataire en contrepartie de la réservation de la date et du travail de préparation engagé.
En cas de report, une nouvelle date pourra être définie selon les disponibilités du prestataire. Toute modification importante de la prestation pourra faire l’objet d’un ajustement tarifaire.
En cas d’empêchement exceptionnel du prestataire, une solution de report sera proposée ou les sommes versées seront intégralement remboursées.'
where issuer = 'alexandre';

update public.commerce_settings
set legal_footer = 'Entrepreneur individuel (micro-entreprise) — SIRET 100 186 949 00010. Prestations réservées aux professionnels. Conditions générales de prestation : alexandrepalanca.fr/conditions-generales',
    default_cancellation_terms = 'En cas d''annulation après acceptation, restent dus le travail réalisé et les frais engagés non récupérables ; les sommes versées sont imputées et tout trop-perçu est restitué.'
where issuer = 'elisa';
