-- Galerie « livraison vidéo » : le client entre son code et télécharge sa ou ses vidéos
-- depuis un lien externe (Drive, WeTransfer, Dropbox…). Rien n'est stocké dans Supabase.
alter table public.galleries add column if not exists delivery text not null default 'photos'
  check (delivery in ('photos', 'video'));
alter table public.galleries add column if not exists video_links jsonb not null default '[]'::jsonb;
