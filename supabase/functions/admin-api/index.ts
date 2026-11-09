import {
  assertBrowserOrigin,
  databaseRequest,
  errorResponse,
  jsonResponse,
  preflightResponse,
  readJson,
  sha256
} from "../_shared/http.ts";

// Chiffrement du code d'accès pour pouvoir l'afficher à l'administrateur (AES-GCM).
// La clé est dérivée du secret serveur GALLERY_SESSION_SECRET : sans lui, le code chiffré est illisible.
async function codeKey() {
  const secret = requiredEnv("GALLERY_SESSION_SECRET");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`gallery-access-code:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptCode(code: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await codeKey(), new TextEncoder().encode(code)));
  const packed = new Uint8Array(iv.length + data.length);
  packed.set(iv);
  packed.set(data, iv.length);
  return `v1:${btoa(String.fromCharCode(...packed))}`;
}
async function decryptCode(value: string | null) {
  if (!value || !value.startsWith("v1:")) return null;
  try {
    const packed = Uint8Array.from(atob(value.slice(3)), (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, await codeKey(), packed.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
function validCode(value: unknown) {
  const code = requiredText(value, "Code d’accès", 64).toUpperCase();
  if (!/^[A-Z0-9-]{3,64}$/.test(code)) throw new Error("Code d’accès invalide : 3 à 64 lettres, chiffres ou tirets.");
  return code;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Le réglage serveur ${name} est manquant.`);
  return value;
}

async function requireAdmin(request: Request) {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "");
  if (!token || token === request.headers.get("apikey")) {
    throw new Error("Session administrateur invalide.");
  }

  const response = await fetch(`${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: requiredEnv("SUPABASE_ANON_KEY"),
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) throw new Error("Session administrateur expirée.");
  const user = await response.json();
  const admins = await databaseRequest(
    `gallery_admins?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`
  ) as Array<{ user_id: string }>;
  if (!admins.length) throw new Error("Accès administrateur refusé.");
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} invalide.`);
  }
  return value.trim();
}

function extensionFromFileName(fileName: unknown) {
  const name = requiredText(fileName, "Nom de fichier", 255);
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (!extension || !["jpg", "jpeg", "png", "webp"].includes(extension)) {
    throw new Error("Seuls les fichiers JPG, PNG ou WebP sont acceptés.");
  }
  return extension;
}

async function createSignedUpload(bucket: string, path: string) {
  const url = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `${url}/storage/v1/object/upload/sign/${bucket}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "x-upsert": "false"
      },
      body: JSON.stringify({})
    }
  );
  const result = await response.json().catch(() => ({}));
  let token: string | null = null;
  if (typeof result.url === "string") {
    try {
      const signedUrl = new URL(result.url, `${url}/`);
      if (signedUrl.origin === new URL(url).origin) {
        token = signedUrl.searchParams.get("token");
      }
    } catch {
      token = null;
    }
  }
  if (!response.ok || !token) {
    console.error("Could not sign gallery upload", response.status, JSON.stringify(result));
    throw new Error("Impossible de préparer le téléversement sécurisé.");
  }
  return token;
}


// Pages du site en cours (suivi de site web) : 1 à 30 pages { nom, adresse https }
function parseWebPages(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    throw new Error("Pages invalides : ajoutez 1 à 30 pages.");
  }
  return value.map((entry, index) => {
    const raw = typeof entry?.url === "string" ? entry.url.trim() : "";
    let url: URL;
    try { url = new URL(raw); } catch { throw new Error(`Page ${index + 1} invalide : collez l'adresse complète (https://…).`); }
    if (url.protocol !== "https:" || raw.length > 2000) throw new Error(`Page ${index + 1} invalide : l'adresse doit commencer par https://.`);
    const name = typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim().slice(0, 80) : `Page ${index + 1}`;
    return { name, url: url.toString() };
  });
}

// Dossiers des contenus réseaux : 1 à 30 liens { nom, lien https, description }
function parseSocialFolders(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    throw new Error("Dossiers invalides : ajoutez 1 à 30 dossiers.");
  }
  return value.map((entry, index) => {
    const raw = typeof entry?.url === "string" ? entry.url.trim() : "";
    let url: URL;
    try { url = new URL(raw); } catch { throw new Error(`Dossier ${index + 1} invalide : collez le lien complet (https://…).`); }
    if (url.protocol !== "https:" || raw.length > 2000) throw new Error(`Dossier ${index + 1} invalide : le lien doit commencer par https://.`);
    const label = typeof entry?.label === "string" && entry.label.trim() ? entry.label.trim().slice(0, 120) : `Dossier ${index + 1}`;
    const description = typeof entry?.description === "string" ? entry.description.trim().slice(0, 300) : "";
    return { label, url: url.toString(), description };
  });
}

// Liens de vidéos (galerie « livraison vidéo ») : 1 à 10 liens https, avec un nom facultatif.
function parseVideoLinks(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new Error("Liens vidéo invalides : ajoutez 1 à 10 liens.");
  }
  return value.map((entry, index) => {
    const raw = typeof entry?.url === "string" ? entry.url.trim() : "";
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`Lien vidéo ${index + 1} invalide : collez l'adresse complète (https://…).`);
    }
    if (url.protocol !== "https:" || raw.length > 2000) {
      throw new Error(`Lien vidéo ${index + 1} invalide : l'adresse doit commencer par https://.`);
    }
    const label = typeof entry?.label === "string" ? entry.label.trim().slice(0, 120) : "";
    // multiple : le lien contient plusieurs vidéos (dossier ou zip) → « Télécharger les vidéos »
    return { label, url: url.toString(), multiple: entry?.multiple === true };
  });
}

Deno.serve(async (request) => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;

  try {
    assertBrowserOrigin(request);
    await requireAdmin(request);

    if (request.method === "GET") {
      const [galleries, orders] = await Promise.all([
        databaseRequest("galleries?select=id,name,type,tariff,status,expires_at,created_at,access_code_encrypted,delivery,video_links,web_pages,feedback_rounds,social_folders,tutorial_path&order=created_at.desc"),
        databaseRequest("gallery_orders?select=id,gallery_id,customer_email,status,currency,subtotal_cents,discount_bps,discount_cents,total_cents,created_at,paid_at,sent_at&order=created_at.desc")
      ]);
      const orderIds = (orders as Array<{ id: string }>).map((order) => order.id);
      let orderPhotos: unknown[] = [];
      if (orderIds.length) {
        orderPhotos = await databaseRequest(
          `gallery_order_photos?select=order_id,photo_number&order_id=in.(${orderIds.join(",")})&order=photo_number.asc`
        ) as unknown[];
      }
      // Code d'accès déchiffré pour l'affichage (null pour les galeries créées avant cette fonction)
      const visibleGalleries = await Promise.all((galleries as Array<Record<string, unknown>>).map(async (gallery) => {
        const { access_code_encrypted, ...rest } = gallery;
        return { ...rest, accessCode: await decryptCode(access_code_encrypted as string | null) };
      }));
      // Retours des clients sur leurs sites (suivi de site web)
      const webIds = (galleries as Array<{ id: string; delivery: string }>).filter((g) => g.delivery === "web").map((g) => g.id);
      const feedback = webIds.length
        ? await databaseRequest(`web_feedback?select=*&gallery_id=in.(${webIds.join(",")})&order=round.asc`)
        : [];
      return jsonResponse(request, 200, { galleries: visibleGalleries, orders, orderPhotos, feedback });
    }

    if (request.method !== "POST") {
      return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    }
    const body = await readJson(request);

    if (body.action === "create-gallery") {
      const name = requiredText(body.name, "Nom de galerie", 160);
      const type = body.type;
      if (type !== "event" && type !== "individual") {
        return jsonResponse(request, 400, { message: "Type de galerie invalide." });
      }
      const delivery = ["video", "web", "social"].includes(String(body.delivery)) ? String(body.delivery) : "photos";
      const videoLinks = delivery === "video" ? parseVideoLinks(body.videoLinks) : [];
      const webPages = delivery === "web" ? parseWebPages(body.webPages) : [];
      const socialFolders = delivery === "social" ? parseSocialFolders(body.socialFolders) : [];
      const rounds = Number(body.feedbackRounds ?? 2);
      if (!Number.isInteger(rounds) || rounds < 0 || rounds > 20) {
        return jsonResponse(request, 400, { message: "Nombre de séries de modifications invalide (0 à 20)." });
      }
      // Vidéo, site, réseaux : pas de tarif (accès libre au contenu)
      const tariff = delivery === "photos" ? body.tariff : "tarif0";
      if (!["tarif0", "tarif2", "tarif5"].includes(String(tariff))) {
        return jsonResponse(request, 400, { message: "Tarif de galerie invalide." });
      }
      const code = requiredText(body.code, "Code d’accès", 64).toUpperCase();
      if (!/^[A-Z0-9-]{3,64}$/.test(code)) {
        return jsonResponse(request, 400, {
          message: "Le code doit contenir 3 à 64 lettres, chiffres ou tirets."
        });
      }
      const days = Number(body.daysOpen);
      // Suivi de site et contenus réseaux : jusqu'à 90 jours ; galeries : 15 jours
      const maxDays = delivery === "web" || delivery === "social" ? 90 : 15;
      if (!Number.isInteger(days) || days < 1 || days > maxDays) {
        return jsonResponse(request, 400, { message: `La durée d’accès doit être comprise entre 1 et ${maxDays} jours.` });
      }
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      // Séance liée (facultatif) : éteint le rappel « publier la galerie sous 72 h »
      const session = typeof body.session === "string" ? body.session : "";
      const link = /^quote:[0-9a-f-]{36}$/i.test(session)
        ? { quote_id: session.slice(6) }
        : /^event:[0-9a-f-]{36}$/i.test(session)
        ? { event_id: session.slice(6) }
        : {};
      const created = await databaseRequest("galleries?select=id,name,type,tariff,status,expires_at", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name,
          type,
          tariff,
          access_code_hash: await sha256(code),
          access_code_encrypted: await encryptCode(code),
          expires_at: expiresAt,
          delivery,
          video_links: videoLinks,
          web_pages: webPages,
          social_folders: socialFolders,
          feedback_rounds: rounds,
          ...link
        })
      }) as Array<{ id: string; name: string; type: string; status: string; expires_at: string }>;
      return jsonResponse(request, 201, { gallery: created[0], accessCode: code });
    }

    // Nouveau code d'accès pour une galerie (l'ancien cesse de fonctionner)
    if (body.action === "set-access-code") {
      const id = requiredText(body.galleryId, "Identifiant de galerie", 36);
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return jsonResponse(request, 400, { message: "Identifiant de galerie invalide." });
      }
      const code = validCode(body.code);
      await databaseRequest(`galleries?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ access_code_hash: await sha256(code), access_code_encrypted: await encryptCode(code) })
      });
      return jsonResponse(request, 200, { ok: true, accessCode: code });
    }

    // Modifier les liens d'une galerie « livraison vidéo »
    // Suivi de site : pages et nombre de séries de modifications
    if (body.action === "set-web-pages") {
      const galleryId = requiredText(body.galleryId, "Galerie", 64);
      const rounds = Number(body.feedbackRounds);
      if (!Number.isInteger(rounds) || rounds < 0 || rounds > 20) {
        return jsonResponse(request, 400, { message: "Nombre de séries de modifications invalide (0 à 20)." });
      }
      await databaseRequest(`galleries?id=eq.${encodeURIComponent(galleryId)}&delivery=eq.web`, {
        method: "PATCH",
        body: JSON.stringify({ web_pages: parseWebPages(body.webPages), feedback_rounds: rounds })
      });
      return jsonResponse(request, 200, { ok: true });
    }

    // Contenus réseaux : dossiers à télécharger
    if (body.action === "set-social-folders") {
      const galleryId = requiredText(body.galleryId, "Galerie", 64);
      await databaseRequest(`galleries?id=eq.${encodeURIComponent(galleryId)}&delivery=eq.social`, {
        method: "PATCH",
        body: JSON.stringify({ social_folders: parseSocialFolders(body.socialFolders) })
      });
      return jsonResponse(request, 200, { ok: true });
    }

    // Contenus réseaux : guide PDF (dépôt direct dans le stockage privé, puis enregistrement)
    if (body.action === "prepare-tutorial-upload") {
      const galleryId = requiredText(body.galleryId, "Galerie", 64);
      if (!/^[0-9a-f-]{36}$/i.test(galleryId)) return jsonResponse(request, 400, { message: "Galerie invalide." });
      const path = `${galleryId}/guide-${Date.now()}.pdf`;
      return jsonResponse(request, 200, { bucket: "client-documents", path, token: await createSignedUpload("client-documents", path) });
    }
    if (body.action === "set-tutorial") {
      const galleryId = requiredText(body.galleryId, "Galerie", 64);
      const path = requiredText(body.path, "Fichier", 200);
      if (!path.startsWith(`${galleryId}/guide-`) || !path.endsWith(".pdf")) {
        return jsonResponse(request, 400, { message: "Fichier invalide." });
      }
      await databaseRequest(`galleries?id=eq.${encodeURIComponent(galleryId)}&delivery=eq.social`, {
        method: "PATCH",
        body: JSON.stringify({ tutorial_path: path })
      });
      return jsonResponse(request, 200, { ok: true });
    }

    if (body.action === "set-video-links") {
      const galleryId = requiredText(body.galleryId, "Galerie", 64);
      const videoLinks = parseVideoLinks(body.videoLinks);
      await databaseRequest(`galleries?id=eq.${encodeURIComponent(galleryId)}&delivery=eq.video`, {
        method: "PATCH",
        body: JSON.stringify({ video_links: videoLinks })
      });
      return jsonResponse(request, 200, { ok: true });
    }

    if (body.action === "close-gallery") {
      const id = requiredText(body.galleryId, "Identifiant de galerie", 36);
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return jsonResponse(request, 400, { message: "Identifiant de galerie invalide." });
      }
      await databaseRequest(`galleries?id=eq.${encodeURIComponent(id)}&status=eq.open`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "closed", closed_at: new Date().toISOString() })
      });
      return jsonResponse(request, 200, { ok: true });
    }

    if (body.action === "prepare-photo-upload") {
      const galleryId = requiredText(body.galleryId, "Identifiant de galerie", 36);
      if (!/^[0-9a-f-]{36}$/i.test(galleryId)) {
        return jsonResponse(request, 400, { message: "Identifiant de galerie invalide." });
      }
      const photoNumber = Number(body.photoNumber);
      if (!Number.isInteger(photoNumber) || photoNumber < 1) {
        return jsonResponse(request, 400, { message: "Numéro de photo invalide." });
      }
      const previewExtension = extensionFromFileName(body.previewFileName);
      const originalExtension = extensionFromFileName(body.originalFileName);
      const galleries = await databaseRequest(
        `galleries?select=id,status,expires_at,delivery&id=eq.${encodeURIComponent(galleryId)}&limit=1`
      ) as Array<{ id: string; status: string; expires_at: string; delivery: string }>;
      if (
        !galleries[0] ||
        galleries[0].status !== "open" ||
        Date.parse(galleries[0].expires_at) <= Date.now()
      ) {
        return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
      }
      if (galleries[0].delivery !== "photos") {
        return jsonResponse(request, 400, { message: "Cet accès ne contient pas de photos (vidéo, site ou contenus réseaux)." });
      }
      const photoId = crypto.randomUUID();
      const previewPath = `${galleryId}/${photoId}/preview.${previewExtension}`;
      const originalPath = `${galleryId}/${photoId}/original.${originalExtension}`;
      const previewBucket = Deno.env.get("GALLERY_PREVIEW_BUCKET") || "gallery-previews";
      const originalsBucket = Deno.env.get("GALLERY_ORIGINALS_BUCKET") || "gallery-originals";
      const [previewToken, originalToken] = await Promise.all([
        createSignedUpload(previewBucket, previewPath),
        createSignedUpload(originalsBucket, originalPath)
      ]);
      return jsonResponse(request, 200, {
        photoId,
        photoNumber,
        preview: { bucket: previewBucket, path: previewPath, token: previewToken },
        original: { bucket: originalsBucket, path: originalPath, token: originalToken }
      });
    }

    if (body.action === "register-photo") {
      const galleryId = requiredText(body.galleryId, "Identifiant de galerie", 36);
      const photoId = requiredText(body.photoId, "Identifiant de photo", 36);
      if (
        !/^[0-9a-f-]{36}$/i.test(galleryId) ||
        !/^[0-9a-f-]{36}$/i.test(photoId) ||
        !Number.isInteger(body.photoNumber) ||
        Number(body.photoNumber) < 1
      ) {
        return jsonResponse(request, 400, { message: "Informations de photo invalides." });
      }
      const galleries = await databaseRequest(
        `galleries?select=id,status,expires_at,delivery&id=eq.${encodeURIComponent(galleryId)}&limit=1`
      ) as Array<{ id: string; status: string; expires_at: string; delivery: string }>;
      if (
        !galleries[0] ||
        galleries[0].status !== "open" ||
        Date.parse(galleries[0].expires_at) <= Date.now()
      ) {
        return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
      }
      if (galleries[0].delivery !== "photos") {
        return jsonResponse(request, 400, { message: "Cet accès ne contient pas de photos (vidéo, site ou contenus réseaux)." });
      }

      const previewPath = requiredText(body.previewPath, "Chemin aperçu", 500);
      const originalPath = requiredText(body.originalPath, "Chemin original", 500);
      if (
        !previewPath.startsWith(`${galleryId}/${photoId}/preview.`) ||
        !originalPath.startsWith(`${galleryId}/${photoId}/original.`) ||
        !/\.(jpg|jpeg|png|webp)$/i.test(previewPath) ||
        !/\.(jpg|jpeg|png|webp)$/i.test(originalPath)
      ) {
        return jsonResponse(request, 400, { message: "Chemin de fichier invalide." });
      }
      await databaseRequest("gallery_photos", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: photoId,
          gallery_id: galleryId,
          photo_number: Number(body.photoNumber),
          preview_path: previewPath,
          original_path: originalPath
        })
      });
      return jsonResponse(request, 201, { ok: true });
    }

    if (body.action === "update-order") {
      const id = requiredText(body.orderId, "Identifiant de commande", 36);
      const status = body.status;
      if (!/^[0-9a-f-]{36}$/i.test(id) ||
        !["sent", "cancelled_refunded"].includes(String(status))) {
        return jsonResponse(request, 400, { message: "Mise à jour de commande invalide." });
      }
      const currentOrders = await databaseRequest(
        `gallery_orders?select=id,status&id=eq.${encodeURIComponent(id)}&limit=1`
      ) as Array<{ id: string; status: string }>;
      const currentStatus = currentOrders[0]?.status;
      if (!currentStatus) {
        return jsonResponse(request, 404, { message: "Commande introuvable." });
      }
      if (
        (status === "sent" && currentStatus !== "paid_to_prepare") ||
        (status === "cancelled_refunded" && !["paid_to_prepare", "sent"].includes(currentStatus))
      ) {
        return jsonResponse(request, 409, { message: "Cette transition de commande n’est pas autorisée." });
      }
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString()
      };
      if (status === "sent") {
        updates.sent_at = new Date().toISOString();
      }
      await databaseRequest(`gallery_orders?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(updates)
      });
      return jsonResponse(request, 200, { ok: true });
    }

    return jsonResponse(request, 400, { message: "Action administrateur inconnue." });
  } catch (error) {
    return errorResponse(request, error);
  }
});
