-- Réponse du client au devis depuis le site (lien envoyé avec le devis par e-mail).
-- response_token : clé secrète du lien « Répondre à la proposition » (une par devis).
alter table public.quotes add column if not exists response_token text unique;
alter table public.quotes add column if not exists responded_at timestamptz;
alter table public.quotes add column if not exists response_comment text not null default '';
alter table public.quotes add column if not exists response_redo boolean not null default false;
