# Mise en service des galeries privées

## État actuel

L’interface possède un mode démonstration (`DEMO2026`) explicitement non sécurisé et sans paiement. Le code `DEMOFERMEE` permet de voir le message de galerie fermée. Les photos de la démo sont des images publiques du portfolio : ne les utilisez pas comme galerie client.

Le backend Supabase et le flux Stripe sont préparés dans `supabase/`, mais ils ne sont pas actifs tant qu’un projet Supabase, le site HTTPS et les secrets ne sont pas configurés. Ne communiquez jamais un vrai code d’accès avant cette configuration.

## Configuration Supabase

1. Créez un projet Supabase et reliez-y ce dossier avec la CLI Supabase.
2. Appliquez les migrations dans l’ordre. Si le schéma initial a déjà été installé manuellement, vérifiez qu’il correspond à `202610010001_private_galleries.sql` et réconciliez l’historique Supabase avant toute commande `db push` ; ne rejouez pas cette migration sur des tables déjà créées.
3. Appliquez ensuite `supabase/migrations/202610290002_gallery_tariffs_and_downloads.sql`, puis `supabase/migrations/202610290003_order_download_email.sql`, qui prépare l’enregistrement de l’envoi de l’e-mail de commande.
4. Vérifiez que les buckets `gallery-previews` et `gallery-originals` sont privés. Les aperçus et les originaux doivent rester séparés.
5. Configurez les secrets des fonctions, sans les mettre dans les fichiers du site :

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `FRONTEND_ORIGIN` — l’origine HTTPS exacte du site, sans chemin final
   - `GALLERY_SESSION_SECRET` — valeur aléatoire d’au moins 32 caractères
   - `GALLERY_PREVIEW_BUCKET=gallery-previews`
   - `GALLERY_ORIGINALS_BUCKET=gallery-originals`
   - `STRIPE_SECRET_KEY` — clé Stripe de test au départ
   - `STRIPE_WEBHOOK_SECRET` — secret du webhook Stripe de cet environnement
   - `RESEND_API_KEY` — clé d’API Resend, uniquement côté serveur
   - `ORDER_EMAIL_FROM=Alexandre Palanca <info@alexandrepalanca.fr>` — expéditeur vérifié dans Resend

   Supabase fournit normalement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` aux fonctions déployées ; vérifiez leurs valeurs dans l’environnement de déploiement. La clé `anon` est publique et peut être configurée dans le frontend. La clé `service_role`, les clés Stripe et le secret de session ne doivent jamais être publiés.

6. Dans `galeries-config.js`, renseignez uniquement `supabaseUrl` et `supabaseAnonKey`. Gardez `demoMode` à `true` jusqu’à validation complète des paiements de test.
7. Déployez les fonctions configurées dans `supabase/config.toml` :

   - `gallery-access`
   - `gallery-data`
   - `gallery-preview`
   - `gallery-download`
   - `create-checkout`
   - `order-status`
   - `admin-api`
   - `stripe-webhook`

   Les fonctions désactivent la validation JWT automatique de Supabase pour valider elles-mêmes soit le jeton de galerie signé, soit la session Auth administrateur, soit la signature webhook Stripe. Ne retirez pas ces contrôles.

## Administration

1. Créez un utilisateur administrateur via Supabase Auth.
2. Récupérez son UUID et inscrivez-le explicitement dans `gallery_admins` depuis l’éditeur SQL Supabase :

   ```sql
   insert into public.gallery_admins (user_id)
   values ('UUID_DE_L_UTILISATEUR_AUTH');
   ```

3. Servez le site en HTTPS, puis ouvrez `admin-galeries.html`.
4. Créez une galerie événementielle (code partagé) ou individuelle et choisissez son tarif :
   - `tarif0` : galerie gratuite, aperçu sans filigrane et téléchargement des originaux haute résolution, photo par photo ou en archive ZIP pour la sélection.
   - `tarif2` : 2 € par photo, sans remise.
   - `tarif5` : 5 € par photo, avec les paliers de remise existants.
5. Pour chaque photo payante, préparez un aperçu filigrané distinct de l’original haute résolution. Pour `tarif0`, l’aperçu doit être sans filigrane. L’interface d’administration téléverse les deux fichiers dans leurs buckets privés.
6. Téléversez les photos avec des numéros uniques et communiquez le code client par un canal séparé.
7. Une galerie arrive à expiration au plus tard après 15 jours. Elle peut aussi être fermée manuellement depuis l’administration. Une galerie fermée bloque les nouveaux accès, la lecture des aperçus gratuits et les nouvelles commandes. Les commandes et références de photos conservées ne sont pas supprimées.

## Stripe en mode test

1. Utilisez les clés de test Stripe côté serveur.
2. Configurez un webhook vers `https://VOTRE-PROJET.supabase.co/functions/v1/stripe-webhook`, avec l’événement `checkout.session.completed`.
3. Placez la signature webhook fournie par Stripe dans `STRIPE_WEBHOOK_SECRET`.
4. Créez et vérifiez le domaine `alexandrepalanca.fr` dans Resend, puis ajoutez dans Cloudflare les enregistrements DNS demandés par Resend. Vérifiez que `info@alexandrepalanca.fr` est accepté comme expéditeur.
5. Enregistrez `RESEND_API_KEY` et `ORDER_EMAIL_FROM` dans les secrets Supabase Edge Functions avant de déployer le webhook. Ne mettez jamais la clé Resend dans le site ou dans Git.
6. Activez les moyens de paiement souhaités dans les paramètres Stripe du bon environnement. Stripe Checkout les récupère depuis le Dashboard ; le site ne transmet pas `payment_method_types`.
7. Les photos téléchargeables sont créées comme produits numériques au moment de la commande et utilisent le code fiscal Stripe `txcd_10000000` (« General - Electronically Supplied Services »), éligible pour Managed Payments. Choisissez un code plus spécifique dans le code serveur si Stripe Tax ou votre comptable vous le recommande pour votre activité et vos pays de vente.
8. Testez le parcours complet avec une galerie de test. Le serveur lit les tarifs en base, recalcule remise et total, crée la commande et la session Checkout. Seul un webhook Stripe dont la signature est valide et dont le paiement est indiqué comme payé fait passer la commande à « Payée, à préparer » et déclenche l’envoi du lien de téléchargement par e-mail.
9. Le lien reçu par e-mail ouvre la page de commande et permet de télécharger le ZIP sans se reconnecter à la galerie. Il donne accès uniquement aux photos payées de la commande correspondante. Vérifiez aussi l’arrivée du message et le dossier indésirable.

Les paliers de `tarif5` sont de 0 % à 1–4 photos, 20 % à 5–9, 25 % à 10–14 et 30 % à partir de 15. Le tarif 2 € ne comporte aucune remise.

Les nouveaux codes d’accès doivent contenir au moins 10 lettres, chiffres ou tirets. Le serveur applique aussi une limite de tentatives par adresse réseau.

## Vérifications avant production

- Confirmer que les deux buckets sont privés et que les utilisateurs `anon` et `authenticated` n’ont pas d’accès direct aux tables ou aux objets.
- Vérifier qu’un original ne peut pas être récupéré depuis le navigateur, même avec une URL devinée.
- Tester code valide, code invalide, expiration et fermeture manuelle d’une galerie.
- Vérifier les paliers, la sélection, la visionneuse, le parcours tactile et l’adresse e-mail.
- Tester les paiements réussis, abandonnés et échoués, ainsi que la répétition d’un webhook.
- Vérifier dans Stripe et dans Supabase que les montants sont identiques et que seul le webhook confirme le paiement.
- Remplacer le contenu de démonstration par des aperçus réellement filigranés avant d’ouvrir les galeries clients.

Les tests de déploiement et de paiement réel/test nécessitent le projet Supabase, le domaine HTTPS et les secrets serveur décrits ci-dessus ; ils ne sont pas présents dans les fichiers locaux.
