-- Espace client : en plus des galeries photo et de la livraison vidéo, deux nouveaux accès par code.
--   web    : suivi de site internet (pages du site en cours affichées dans un cadre, retours du client
--            page par page ; chaque envoi compte comme une série de modifications prévue au contrat)
--   social : contenus réseaux (dossiers à télécharger par lien + guide PDF affiché dans un cadre)

alter table public.galleries drop constraint if exists galleries_delivery_check;
alter table public.galleries add constraint galleries_delivery_check
  check (delivery in ('photos', 'video', 'web', 'social'));

alter table public.galleries add column if not exists web_pages jsonb not null default '[]'::jsonb;
alter table public.galleries add column if not exists feedback_rounds integer not null default 2
  check (feedback_rounds between 0 and 20);
alter table public.galleries add column if not exists social_folders jsonb not null default '[]'::jsonb;
alter table public.galleries add column if not exists tutorial_path text;

-- Retours du client sur le site (une ligne par série envoyée)
create table if not exists public.web_feedback (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  round integer not null,
  entries jsonb not null default '[]'::jsonb,  -- [{ page, url, approved, comment }]
  final_comment text not null default '',
  submitted_at timestamptz not null default now(),
  unique (gallery_id, round)
);
alter table public.web_feedback enable row level security;

-- Guides PDF des contenus réseaux (privés, lus par lien signé)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-documents', 'client-documents', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;
