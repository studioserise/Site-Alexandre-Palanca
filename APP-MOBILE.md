# Application mobile d'administration (PWA)

Adresse : **https://alexandrepalanca.fr/app/**

L'application mobile est une nouvelle interface de l'administration existante. Elle n'a ni base de données ni règles d'accès propres. Chaque action passe par les mêmes fonctions serveur que l'administration sur ordinateur :
- `commerce-api` et `admin-api` pour la gestion ;
- `push` pour les notifications.

Ces fonctions vérifient à chaque appel que le compte connecté figure parmi les administrateurs (`gallery_admins`). Tout ce qui est fait sur le téléphone apparaît donc immédiatement sur le site, et inversement.

## Installer sur l'iPhone

1. Ouvrir **alexandrepalanca.fr/app** dans **Safari**.
2. Toucher **Partager**, puis **« Sur l'écran d'accueil »**, puis **Ajouter**.
3. Ouvrir « Alex & Elisa » depuis l'écran d'accueil et se connecter avec le compte administrateur habituel.

L'application s'ouvre en plein écran, sans barre Safari, et reste connectée. Le jeton est renouvelé automatiquement ; « Se déconnecter » efface la session, les données gardées sur l'appareil et l'abonnement aux notifications.

## Rubriques

| Onglet | Contenu | Source |
|---|---|---|
| Accueil | chiffres clés, tâches prioritaires, rendez-vous des 15 prochains jours, raccourcis | `notifications`, `planning`, `dashboard` |
| Planning | vues jour, semaine et mois ; filtres (confirmés, en attente, autres) ; création, modification et suppression d'événements ; ouverture des devis et des demandes | `planning`, `save-event`, `delete-event` |
| À faire | centre de notifications : filtres, suppression, télécharger ou envoyer la proposition commune, demandes clients (créer le devis, ignorer) | `notifications`, `dismiss-*`, `document-url`, `send-document` |
| Espace client | galeries, vidéos, suivi de site, contenus réseaux ; code d'accès ; partage de l'accès ; fermeture ; commandes et retours | `admin-api` (GET, `close-gallery`) |
| Gestion | devis, factures et clients (Alex, Elisa ou les deux) ; PDF, PDF signé, envoi au client, enregistrement d'un règlement, appel, e-mail, effacement RGPD | `list-*`, `get-*`, `add-payment`, `erase-client` |
| Menu ⋮ | Notifications, Installer, Gestion commerciale complète, Espaces clients (création, envoi de photos), Se déconnecter | — |

**L'application ne contient que l'administration.**
- Le site public n'y est jamais affiché : ni menu ni pied de page du site sur les pages de gestion ouvertes depuis l'application, dont le logo ramène à l'application.
- Tout lien vers une page publique (galerie d'un client, page de rappel, etc.) s'ouvre dans Safari, hors de l'application.

Certaines opérations restent dans la version complète, adaptée au téléphone, qui s'ouvre dans l'application. Un bouton « ‹ Application » permet d'en revenir. Il s'agit de :
- la **création ou modification d'un devis** (catalogue, lignes, aperçu PDF) ;
- la **création d'un espace client avec envoi de photos** ;
- les **paramètres** des prestataires.

Le bouton **+** de chaque onglet y mène directement, par exemple « Devis — Site internet (à deux) ».

Les rubriques demandées « Établissements », « Contenus/publications » et « Tâches » n'existent pas dans le système. Elles ont été adaptées ainsi, sans créer de tables fictives :
- les **tâches** sont le centre « À faire » ;
- les **contenus** sont l'« Espace client » ;
- l'**administration** est « Gestion » et le menu.

## Planning dans le Calendrier de l'iPhone

**Accès :** Menu ⋮ → **Planning dans mon Calendrier**, ou le lien sous le planning. Le bouton **Ajouter au Calendrier de l'iPhone** abonne l'app Calendrier au planning, qui devient un calendrier « Alex & Elisa — Planning ». Le lien peut aussi être copié pour Google Agenda ou le Mac.

**Mise à jour :** automatique, dans les deux sens de la gestion (application et ordinateur) : ajouts, modifications et suppressions. Chaque événement garde le même identifiant d'une lecture à l'autre. L'iPhone relit le calendrier tout seul, en général toutes les 15 min à 1 h ; le réglage « Nouvelles données → Toutes les 15 minutes » accélère.

**Ce qui est affiché :**
- **confirmés** : séances confirmées et devis acceptés ;
- **provisoires** : options, devis en attente et dates demandées par des clients ;
- période : 90 jours passés et 400 jours à venir ;
- durée de 2 h par défaut, faute d'heure de fin dans le planning ;
- le calendrier est en lecture seule.

**Technique :**
- fonction `calendar` (GET `?t=` pour le flux iCalendar RFC 5545, POST pour obtenir ou changer son lien) ;
- `supabase/functions/_shared/ical.ts` ;
- table `calendar_feeds`, migration 0026 : un lien secret de 256 bits par administrateur, révocable avec « Changer le lien » ; le lien ne fonctionne plus si le compte n'est plus administrateur.

**Vérification :** le fichier produit a été relu avec la bibliothèque ical.js de Mozilla. Heures d'été et d'hiver, rendez-vous passant minuit, accents et points-virgules : tout est correct.

**À tester sur l'iPhone :** l'abonnement, puis l'apparition d'un événement ajouté dans l'application.

## Hors connexion

- L'interface s'ouvre sans réseau (service worker `app/sw.js`).
- Les dernières données consultées s'affichent, avec un bandeau « Hors connexion — données enregistrées le… ».
- Les modifications sont **désactivées hors ligne**, pour éviter les conflits et les pertes de données.
- Les données de Supabase ne sont jamais mises en cache par le service worker.

## Notifications push

**Activer :** Menu ⋮ → **Notifications** → lire l'explication → **Activer sur cet appareil**. L'iPhone demande alors l'autorisation, jamais avant ce geste. Une notification de test est envoyée tout de suite.

- **Sur iPhone :** iOS 16.4 ou plus récent, et application **installée** sur l'écran d'accueil (exigence d'Apple).
- **Préférences** (par administrateur) :
  - activation générale ;
  - catégories : Planning, Échéances, Espace client, Administration, Système ;
  - délai avant un rendez-vous : 15 min, 30 min, 1 h, 2 h ou la veille ;
  - programme du jour à 8 h ;
  - délai avant une échéance : 2, 6, 24 ou 48 h ;
  - silence de 22 h à 7 h. Les alertes système passent quand même ; les autres arrivent à 7 h.
- **Ce qui est envoyé :**
  - rappel avant chaque rendez-vous confirmé du planning (séances, options, devis acceptés avec heure) ;
  - récapitulatif à 8 h ;
  - nouvelles entrées du centre « À faire » : demandes, devis acceptés ou refusés, virements signalés, galeries… Les notifications déjà présentes au moment de l'activation ne sont pas renvoyées ;
  - échéance proche (acompte, relance…) ;
  - échec d'une tâche automatique du site.
- **Fonctionnement technique :**
  - Web Push avec authentification VAPID. Le chiffrement aes128gcm est écrit sans bibliothèque externe (`supabase/functions/_shared/webpush.ts`) et vérifié avec les bibliothèques de référence `http_ece` et `jose`.
  - La fonction `push-dispatch` est appelée **toutes les 5 minutes** par pg_cron.
  - Anti-doublon : table `push_log`, une notification par clé et par administrateur.
  - Plus de 3 nouveautés d'un coup donnent un seul résumé.
  - Un abonnement expiré (404/410) est supprimé. L'application le recrée à chaque ouverture : renouvellement automatique, y compris après une mise à jour.
- **Clés VAPID :** créées automatiquement par le serveur au premier usage, dans la table `push_keys`. Elle n'a aucun accès public : RLS active, sans règle, et aucun droit pour `anon` ni `authenticated`. La clé privée ne quitte jamais le serveur.

## Fichiers

**Créés :**
- `app/index.html`, `app/app.css`, `app/app.js`, `app/sw.js`, `app/manifest.webmanifest`, `app/icons/*` ;
- `app-return.js` (dans l'application installée seulement : bouton « ‹ Application », menu et pied de page du site masqués, liens publics ouverts dans Safari) ;
- `supabase/functions/push/index.ts`, `supabase/functions/push-dispatch/index.ts` ;
- `supabase/functions/_shared/webpush.ts`, `supabase/functions/_shared/push-core.ts` ;
- `supabase/migrations/202611120025_push_notifications.sql` :
  - 4 tables : `push_keys`, `push_subscriptions`, `push_preferences`, `push_log` ;
  - la fonction `recent_http_errors` ;
  - la tâche planifiée `notifications-push`.

**Modifiés, sans changement de comportement sur ordinateur :**
- `admin.html`, `gestion-commerciale.html`, `admin-galeries.html` : chargement de `app-return.js` ;
- `commerce.js` : lien direct `#nouveau=alexandre|elisa|reseaux|site` ;
- `supabase/functions/_shared/admin.ts` : `requireAdmin` renvoie aussi l'identité du compte ;
- `supabase/config.toml` : déclaration de `push` et `push-dispatch` ;
- `_headers` : `/app/*` non indexé, service worker et manifeste toujours relus.

## Mise en ligne

1. Site : *Synchroniser les modifications* dans VS Code (Cloudflare Pages).
2. Base et fonctions, avec accord explicite :
   - `supabase db push --linked` pour la migration 0025, ainsi que 0023 et 0024 si elles ne sont pas encore appliquées ;
   - `supabase functions deploy push push-dispatch commerce-api admin-api gallery-access quote-response quote-payment quote-reminders contact-request`.

## Tests réalisés

**Navigateur Chromium au format iPhone 390 × 844, avec un serveur simulé :**
- connexion ;
- les 5 onglets et le badge ;
- vues mois et semaine ;
- création d'un événement (données envoyées vérifiées) ;
- fiche devis ;
- préférences de notifications enregistrées ;
- **aucune demande d'autorisation automatique** ;
- rechargement **hors connexion** : interface et dernières données affichées avec le bandeau ;
- 0 erreur JavaScript ;
- pages d'administration sur ordinateur inchangées : 0 erreur, pas de bouton « Application » hors de l'application installée.

**Notifications (simulation serveur) :**
- rappel de rendez-vous 1 h avant, nouvelle demande et alerte système envoyés, chiffrés, puis **déchiffrés avec `http_ece`** ;
- second passage : **0 doublon** ;
- silence de nuit : seule l'alerte système passe ;
- heures d'été et d'hiver correctes.

## À tester sur un vrai iPhone (non vérifiable ici)

Le système de notifications n'est **pas** à considérer comme opérationnel avant ces essais :
1. installation depuis Safari, ouverture en plein écran et zones de sécurité (encoche, barre du bas) ;
2. activation des notifications, puis réception de la notification de test **application fermée** ;
3. rappel de planning : créer un événement dans un peu plus d'une heure avec le délai « 1 heure avant » ;
4. rappel d'échéance ;
5. désactivation, puis plus rien n'est reçu ;
6. après une mise à jour du site : les notifications arrivent toujours (abonnement resynchronisé à l'ouverture).
