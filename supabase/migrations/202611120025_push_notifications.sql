-- Notifications push de l'application mobile d'administration (Web Push + VAPID).
-- Toutes ces tables ne sont lues et écrites que par les fonctions serveur (clé de service) :
-- RLS activée sans règle, aucun droit pour les rôles publics.

-- Clés VAPID : générées par la fonction « push » au premier usage. La clé privée ne quitte jamais le serveur.
create table if not exists public.push_keys (
  id smallint primary key default 1 check (id = 1),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);

-- Abonnements (un par appareil), rattachés au compte administrateur
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failures integer not null default 0,
  last_error text not null default ''
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Préférences par administrateur (activation, catégories, délais de rappel, silence la nuit)
create table if not exists public.push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Journal anti-doublon : une notification (clé) n'est envoyée qu'une fois par administrateur
create table if not exists public.push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.push_keys enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_preferences enable row level security;
alter table public.push_log enable row level security;
revoke all on table public.push_keys, public.push_subscriptions, public.push_preferences, public.push_log
  from anon, authenticated;

-- Erreurs récentes des tâches automatiques (appels HTTP de pg_cron vers les fonctions) :
-- signalées par une notification « Système ».
create or replace function public.recent_http_errors(p_since timestamptz)
returns table (id bigint, status_code integer, error_msg text, created timestamptz)
language sql
security definer
set search_path = ''
as $$
  select r.id, r.status_code, r.error_msg, r.created
  from net._http_response r
  where r.created >= p_since
    and (r.status_code >= 400 or r.error_msg is not null or r.timed_out)
  order by r.id;
$$;
revoke all on function public.recent_http_errors(timestamptz) from public, anon, authenticated;
grant execute on function public.recent_http_errors(timestamptz) to service_role;

-- Envoi des notifications toutes les 5 minutes (même secret d'appel que les autres tâches)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'notifications-push') then
    perform cron.unschedule('notifications-push');
  end if;
end;
$$;

select cron.schedule(
  'notifications-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')
    ),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
