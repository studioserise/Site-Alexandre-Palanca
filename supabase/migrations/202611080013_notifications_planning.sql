-- Centre de notifications et planning de l'espace administrateur.

-- 1. Demandes reçues par le formulaire du site (pour créer un devis à partir d'elles).
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  service text not null default '',
  type text not null default '',
  wanted_date date,                -- date souhaitée (affichée en gris « à confirmer » sur le planning)
  date_text text not null default '',
  message text not null default '',
  notes text not null default '',
  client_id uuid references public.clients (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'quoted', 'dismissed')),
  quote_id uuid references public.quotes (id) on delete set null
);
create index if not exists contact_requests_status_idx on public.contact_requests (status);
alter table public.contact_requests enable row level security;

-- 2. Planning : dates ajoutées à la main (séance confirmée, à confirmer, ou autre).
create table if not exists public.planning_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_time text not null default '',
  title text not null check (char_length(title) between 1 and 200),
  location text not null default '',
  kind text not null default 'seance' check (kind in ('seance', 'option', 'autre')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists planning_events_date_idx on public.planning_events (event_date);
alter table public.planning_events enable row level security;

-- 3. Notifications écartées à la main (les autres disparaissent seules quand la tâche est faite).
create table if not exists public.notification_dismissals (
  key text primary key,
  dismissed_at timestamptz not null default now()
);
alter table public.notification_dismissals enable row level security;

-- 4. Galeries : statistiques et séance liée (pour le rappel « publier la galerie sous 72 h »).
alter table public.galleries add column if not exists view_count integer not null default 0;
alter table public.galleries add column if not exists last_viewed_at timestamptz;
alter table public.galleries add column if not exists download_count integer not null default 0;
alter table public.galleries add column if not exists quote_id uuid references public.quotes (id) on delete set null;
alter table public.galleries add column if not exists event_id uuid references public.planning_events (id) on delete set null;

create or replace function public.count_gallery_view(p_gallery uuid)
returns void language sql security definer set search_path = public as $$
  update public.galleries set view_count = view_count + 1, last_viewed_at = now() where id = p_gallery;
$$;
create or replace function public.count_gallery_download(p_gallery uuid)
returns void language sql security definer set search_path = public as $$
  update public.galleries set download_count = download_count + 1 where id = p_gallery;
$$;
revoke all on function public.count_gallery_view(uuid) from public, anon, authenticated;
revoke all on function public.count_gallery_download(uuid) from public, anon, authenticated;
grant execute on function public.count_gallery_view(uuid) to service_role;
grant execute on function public.count_gallery_download(uuid) to service_role;
