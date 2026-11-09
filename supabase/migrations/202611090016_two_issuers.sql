-- Deux prestataires indépendants dans la gestion commerciale :
--   alexandre : Alexandre Palanca, photographie et vidéo (fiche existante, id 1)
--   elisa     : Elisa Martignac, webdesign et création de sites internet (nouvelle fiche, id 2)
-- Chacun a ses coordonnées, ses mentions, son IBAN, son catalogue, ses conditions par défaut
-- et sa propre numérotation (AP-… / EM-…). Les devis, factures et règlements ne sont jamais mélangés.

-- 1. Fiches prestataires
alter table public.commerce_settings drop constraint if exists commerce_settings_id_check;
alter table public.commerce_settings add constraint commerce_settings_id_check check (id in (1, 2));
alter table public.commerce_settings add column if not exists issuer text;
alter table public.commerce_settings add column if not exists prefix text not null default '';
alter table public.commerce_settings add column if not exists notify_email text not null default '';
alter table public.commerce_settings add column if not exists card_payments boolean not null default false;
alter table public.commerce_settings add column if not exists cancellation_heading text not null default 'Conditions d''annulation';
alter table public.commerce_settings add column if not exists delivery_heading text not null default 'Conditions de livraison';
alter table public.commerce_settings add column if not exists usage_heading text not null default 'Utilisation des photographies et vidéos';

update public.commerce_settings
set issuer = 'alexandre', prefix = 'AP', card_payments = true
where id = 1;

insert into public.commerce_settings (
  id, issuer, prefix, legal_name, trade_name, siren, address, postal_code, city, email, phone, iban, bic,
  vat_mention, legal_footer, notify_email, card_payments,
  cancellation_heading, delivery_heading, usage_heading,
  default_payment_terms, default_cancellation_terms, default_delivery_terms, default_usage_terms,
  default_validity_days, default_deposit_bps, invoice_payment_days
) values (
  2, 'elisa', 'EM', 'Elisa Martignac', 'Elisa Martignac — Webdesign & création de sites internet',
  '100 186 949', '21 les Bouleaux', '15130', 'Ytrac', 'mtgcelisa@gmail.com', '06 65 47 73 51',
  'FR76 1680 7003 7936 8908 3019 340', '',
  'TVA non applicable, art. 293 B du CGI',
  'Entrepreneur individuel (micro-entreprise) — SIRET 100 186 949 00010. Conditions générales de prestation (version novembre 2026) applicables, disponibles sur demande.',
  'mtgcelisa@gmail.com', false,
  'Annulation', 'Réalisation et livraison', 'Propriété intellectuelle et utilisation du site',
  'Acompte de 30 % à l''acceptation du devis (premier règlement du prix, et non des arrhes) ; la réalisation démarre à sa réception. Solde de 70 % à la livraison, avant la mise en ligne définitive et la remise des accès. Règlement par virement bancaire.',
  'En cas d''annulation après acceptation, restent dus le travail réalisé et les frais engagés non récupérables ; les sommes versées sont imputées et tout trop-perçu est restitué. Le droit de rétractation des consommateurs s''applique le cas échéant.',
  'Délai indicatif de 4 à 8 semaines, à compter de l''acceptation du devis, de l''acompte et de la réception des contenus. Deux séries de modifications incluses ; au-delà, 45 € de l''heure ou devis complémentaire. Assistance de 30 jours et garantie corrective de 3 mois après la livraison. Nom de domaine, hébergement et services tiers sont souscrits et payés par le client.',
  'Après paiement intégral, le client reçoit les droits d''utilisation nécessaires à l''exploitation du site livré ; les éléments de tiers (polices, images, extensions…) restent soumis à leurs licences. Le client garantit disposer des droits sur les contenus qu''il fournit. Le site peut être présenté dans le portfolio de la prestataire, sauf opposition écrite.',
  30, 3000, 30
) on conflict (id) do nothing;

alter table public.commerce_settings alter column issuer set not null;
create unique index if not exists commerce_settings_issuer_idx on public.commerce_settings (issuer);

-- 2. Prestataire de chaque prestation du catalogue, devis et facture
alter table public.services add column if not exists issuer text not null default 'alexandre'
  check (issuer in ('alexandre', 'elisa'));
alter table public.quotes add column if not exists issuer text not null default 'alexandre'
  check (issuer in ('alexandre', 'elisa'));
alter table public.invoices add column if not exists issuer text not null default 'alexandre'
  check (issuer in ('alexandre', 'elisa'));
create index if not exists quotes_issuer_idx on public.quotes (issuer);
create index if not exists invoices_issuer_idx on public.invoices (issuer);

-- 3. Numérotation continue propre à chaque prestataire : AP-D-2026-0001, EM-F-2026-0001…
alter table public.document_counters add column if not exists issuer text not null default 'alexandre';
alter table public.document_counters drop constraint if exists document_counters_pkey;
alter table public.document_counters add primary key (issuer, kind, year);

drop function if exists public.next_document_number(text);
create or replace function public.next_document_number(p_kind text, p_issuer text default 'alexandre')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Europe/Paris'))::integer;
  v_number integer;
  v_issuer_prefix text;
  v_prefix text;
begin
  select prefix into v_issuer_prefix from public.commerce_settings where issuer = p_issuer;
  if v_issuer_prefix is null then
    raise exception 'Prestataire inconnu : %', p_issuer;
  end if;
  insert into public.document_counters as c (issuer, kind, year, last_number)
  values (p_issuer, p_kind, v_year, 1)
  on conflict (issuer, kind, year) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  v_prefix := case p_kind
    when 'quote' then 'D'
    when 'invoice' then 'F'
    when 'deposit' then 'A'
    else 'AV'
  end;
  return case when v_issuer_prefix = '' then '' else v_issuer_prefix || '-' end
    || v_prefix || '-' || v_year || '-' || lpad(v_number::text, 4, '0');
end;
$$;
revoke all on function public.next_document_number(text, text) from public, anon, authenticated;
grant execute on function public.next_document_number(text, text) to service_role;

-- 4. Catalogue d'Elisa (formules du site ; modifiable ensuite dans la gestion commerciale)
insert into public.services (issuer, name, description, unit_price_cents, unit, vat_rate_bps, category)
select 'elisa', name, description, price, unit, 0, category from (values
  ('Site essentiel',
   'Une page ou un site simple pour présenter votre activité et vos informations clés. Comprend : échange de cadrage, direction artistique, design responsive, intégration des contenus fournis et formulaire de contact.',
   65000, 'forfait', 'Site internet'),
  ('Site vitrine',
   'Un site multipage pour présenter en détail votre activité, vos services et vos réalisations. Comprend : architecture éditoriale, direction artistique personnalisée, pages dédiées, galerie, mise en page responsive et accompagnement à la mise en ligne.',
   120000, 'forfait', 'Site internet'),
  ('Site sur mesure',
   'Une expérience entièrement pensée pour un projet aux besoins et fonctionnalités spécifiques. Comprend : atelier de conception, parcours et fonctionnalités sur mesure, univers graphique approfondi, production et suivi de projet dédiés.',
   200000, 'forfait', 'Site internet'),
  ('Intervention ponctuelle',
   'Modification, mise à jour ou évolution hors périmètre initial (petites interventions).',
   4500, 'heure', 'Options')
) as defaults(name, description, price, unit, category)
where not exists (select 1 from public.services where issuer = 'elisa');
