-- Abonnement au planning depuis le Calendrier de l'iPhone (ou Google Agenda, Calendrier du Mac).
-- Chaque administrateur a un lien secret personnel (jeton aléatoire de 256 bits), révocable à tout moment.
-- Table lue uniquement par les fonctions serveur : RLS activée sans règle, aucun droit public.
create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) >= 40),
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz
);

alter table public.calendar_feeds enable row level security;
revoke all on table public.calendar_feeds from anon, authenticated;
