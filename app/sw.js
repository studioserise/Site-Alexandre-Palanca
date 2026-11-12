// Service worker de l'application d'administration.
// - Hors connexion : l'interface (fichiers de /app/, polices, styles partagés) est gardée en cache ;
//   les données ne passent jamais par ce cache (l'application garde elle-même la dernière version lue).
// - Notifications push : affichage et ouverture de l'écran concerné.
const VERSION = "app-v3";
const SHELL = [
  "/app/",
  "/app/app.css?v=2",
  "/app/app.js?v=3",
  "/app/manifest.webmanifest",
  "/app/icons/icon-192.png",
  "/app/icons/apple-touch-icon.png",
  "/galeries-config.js?v=2",
  "/fonts.css?v=2",
  "/fonts/introrust.woff2",
  "/admin-center.css?v=commune",
  "/favicon.png?v=5"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("app-") && key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase et services externes : jamais mis en cache

  // Page de l'application : réseau d'abord (dernière version), cache si hors connexion
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put("/app/", copy));
          return response;
        })
        .catch(() => caches.match("/app/"))
    );
    return;
  }

  // Fichiers de l'interface : cache d'abord, mis à jour en arrière-plan
  if (SHELL.includes(url.pathname + url.search) || url.pathname.startsWith("/app/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});

// ---------------------------------------------------------------- notifications push

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() ?? "" }; }
  const title = data.title || "Alex & Elisa";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag || undefined,          // même sujet : la notification précédente est remplacée
    data: { url: data.url || "/app/" },
    icon: "/app/icons/icon-192.png",
    badge: "/app/icons/icon-192.png",
    timestamp: Date.now()
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(`${self.location.origin}/app/`)) {
        await client.focus();
        client.postMessage({ type: "open", url: target });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

// Abonnement renouvelé par le navigateur : l'application le réenregistre à sa prochaine ouverture.
self.addEventListener("pushsubscriptionchange", () => {});
