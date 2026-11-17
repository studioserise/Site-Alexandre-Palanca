-- Suivi de site : texte d'introduction écrit par l'administrateur (présentation du travail, instructions),
-- affiché au client au-dessus de l'aperçu du site.
alter table public.galleries
  add column if not exists web_intro text not null default '';

alter table public.galleries
  drop constraint if exists galleries_web_intro_length;
alter table public.galleries
  add constraint galleries_web_intro_length check (char_length(web_intro) <= 4000);
