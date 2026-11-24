-- Choix « acompte ou non » : les modalités de paiement s'adaptent au choix.
-- 1. Texte par défaut des modalités quand aucun acompte n'est demandé (devis), propre à chaque prestataire.
alter table public.commerce_settings
  add column if not exists default_payment_terms_no_deposit text not null default '';

update public.commerce_settings
set default_payment_terms_no_deposit =
  'Aucun acompte n''est demandé. La totalité est à régler au plus tard le jour de la prestation : par virement bancaire, ou sur place au moment de la prestation, en espèces ou par virement.',
  updated_at = now()
where issuer = 'alexandre' and default_payment_terms_no_deposit = '';

update public.commerce_settings
set default_payment_terms_no_deposit =
  'Aucun acompte n''est demandé. La totalité est à régler à la livraison, avant la mise en ligne définitive et la remise des accès. Règlement par virement bancaire.',
  updated_at = now()
where issuer = 'elisa' and default_payment_terms_no_deposit = '';

-- 2. Factures créées à la main : acompte demandé à réception (en 1/100 %, 0 = pas d'acompte).
alter table public.invoices
  add column if not exists deposit_bps integer not null default 0
  check (deposit_bps between 0 and 10000);
