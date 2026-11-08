-- Textes par défaut des conditions du devis (pré-remplis à chaque nouveau devis, toujours modifiables).
-- Un retour à la ligne sépare chaque mention.
update public.commerce_settings
set
  default_deposit_bps = 3000,
  default_payment_terms =
    'Un acompte de 30 % est demandé à la validation du devis afin de confirmer la réservation de la prestation. Le solde est à régler selon les modalités indiquées sur le devis ou la facture. Le règlement s’effectue par virement bancaire.',
  default_cancellation_terms =
    'Toute annulation doit être communiquée par écrit. En cas d’annulation par le client moins de 72 h avant la prestation, l’acompte versé reste acquis au prestataire en contrepartie de la réservation de la date et du travail de préparation engagé. Sinon, un remboursement de 50 % de l’acompte pourra être versé par le prestataire.' || E'\n' ||
    'En cas de report, une nouvelle date pourra être définie selon les disponibilités du prestataire. Toute modification importante de la prestation pourra faire l’objet d’un ajustement tarifaire.' || E'\n' ||
    'En cas d’empêchement exceptionnel du prestataire, une solution de report sera proposée ou les sommes versées seront intégralement remboursées.',
  default_delivery_terms =
    'Les photographies et vidéos finalisées sont livrées au format numérique, par l’intermédiaire d’une galerie privée sur le site du prestataire.' || E'\n' ||
    'Le délai de livraison est précisé dans le devis et dépend de la nature de la prestation. Les fichiers sont remis en haute définition, prêts à être utilisés sur les supports convenus.' || E'\n' ||
    'Les fichiers bruts (RAW, rushes vidéo et fichiers de travail) ne sont pas inclus dans la prestation, sauf accord préalable.',
  default_usage_terms =
    'Le photographe et vidéaste conserve ses droits d’auteur sur l’ensemble des créations réalisées.' || E'\n' ||
    'Le client bénéficie d’un droit d’utilisation des images et vidéos pour les supports, les usages et la durée définis dans le devis. Toute utilisation supplémentaire, cession à un tiers, modification ou exploitation commerciale non prévue initialement devra faire l’objet d’un accord préalable.' || E'\n' ||
    'Le prestataire pourra utiliser certaines images pour présenter son travail dans son portfolio, sur son site internet et ses réseaux sociaux, sous réserve de l’accord préalable du client.',
  updated_at = now()
where id = 1;
