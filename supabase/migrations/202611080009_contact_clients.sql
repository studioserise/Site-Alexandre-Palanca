-- Fiches clients créées automatiquement par le formulaire de contact du site.
-- « formulaire » : supprimée par le nettoyage nocturne si, 6 mois après, aucun devis ni facture ne l'utilise.
alter table public.clients
  add column if not exists source text not null default 'manuel'
  check (source in ('manuel', 'formulaire'));
