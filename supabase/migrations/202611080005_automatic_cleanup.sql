-- Nettoyage automatique (fonction Edge « cleanup », lancée chaque nuit) :
--  - galeries fermées depuis plus de 2 mois : photos supprimées ; la galerie aussi si elle n'a aucune commande
--    (les commandes sont des traces de vente, conservées pour la comptabilité) ;
--  - devis refusés depuis plus de 2 mois : supprimés avec leur PDF.

-- 1. Date du refus d'un devis, enregistrée automatiquement au passage en « refusé ».
alter table public.quotes add column if not exists refused_at timestamptz;

update public.quotes
set refused_at = updated_at
where status = 'refused' and refused_at is null;

create or replace function public.quotes_track_refusal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'refused' and (tg_op = 'INSERT' or old.status is distinct from 'refused') then
    new.refused_at := now();
  elsif new.status <> 'refused' then
    new.refused_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_track_refusal on public.quotes;
create trigger quotes_track_refusal
before insert or update of status on public.quotes
for each row execute function public.quotes_track_refusal();

-- 2. Secret d'appel de la fonction « cleanup » : généré ici, rangé dans le coffre (Vault),
--    jamais écrit dans les fichiers. La fonction le vérifie via cleanup_secret_valid().
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cleanup_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cleanup_secret');
  end if;
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret('https://rrytedgilrwsczoqeyzx.supabase.co', 'project_url');
  end if;
end;
$$;

create or replace function public.cleanup_secret_valid(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'cleanup_secret' and decrypted_secret = p_secret
  );
$$;
revoke all on function public.cleanup_secret_valid(text) from public, anon, authenticated;
grant execute on function public.cleanup_secret_valid(text) to service_role;

-- 3. Planification : chaque nuit à 3 h (UTC), appel de la fonction « cleanup ».
--    L'adresse du projet et le secret d'appel sont lus dans le coffre (Vault) au moment de l'appel.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('nettoyage-automatique')
where exists (select 1 from cron.job where jobname = 'nettoyage-automatique');

select cron.schedule(
  'nettoyage-automatique',
  '0 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
