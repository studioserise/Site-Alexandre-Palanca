-- Rendez-vous de la prestation, paiement par virement (fiche de virement sur le site),
-- rappels envoyés au client 72 h et 24 h avant (après validation d'Alex).

-- 1. Rendez-vous : date, heure et lieu de la prestation (servent aux rappels et aux échéances).
alter table public.quotes add column if not exists service_date date;
alter table public.quotes add column if not exists service_time text not null default '';
alter table public.quotes add column if not exists service_location text not null default '';

-- 2. BIC (affiché avec l'IBAN sur la fiche de virement) ; virement signalé par le client.
alter table public.commerce_settings add column if not exists bic text not null default '';
alter table public.quotes add column if not exists deposit_transfer_notified_at timestamptz;
alter table public.quotes add column if not exists balance_transfer_notified_at timestamptz;

-- 3. Rappels : préparés automatiquement, envoyés au client seulement après validation d'Alex.
create table if not exists public.quote_reminders (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  kind text not null check (kind in ('j3', 'j1')),
  token text not null unique,
  message text not null default '',
  prepared_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (quote_id, kind)
);
alter table public.quote_reminders enable row level security;

-- 4. Conditions de paiement par défaut : acompte au plus tard 72 h avant, solde jusqu'au jour J.
update public.commerce_settings
set default_payment_terms =
  'Un acompte de 30 % est demandé à la validation du devis afin de confirmer la réservation de la prestation. Il doit être réglé par virement bancaire au plus tard 72 h avant la prestation.' || E'\n' ||
  'Le solde est à régler au plus tard le jour de la prestation : par virement bancaire, ou sur place au moment de la prestation, en espèces ou par virement.',
  updated_at = now()
where id = 1;

-- 5. Planification : toutes les heures, préparation des rappels (fonction « quote-reminders »).
select cron.unschedule('rappels-devis')
where exists (select 1 from cron.job where jobname = 'rappels-devis');

select cron.schedule(
  'rappels-devis',
  '7 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/quote-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')
    ),
    body := '{"action":"prepare"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
