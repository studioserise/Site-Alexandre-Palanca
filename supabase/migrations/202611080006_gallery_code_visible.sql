-- Code d'accès consultable par l'administrateur : conservé chiffré (AES-GCM, clé dérivée d'un secret serveur).
-- L'empreinte access_code_hash reste la seule utilisée pour vérifier l'accès des clients.
alter table public.galleries add column if not exists access_code_encrypted text;
