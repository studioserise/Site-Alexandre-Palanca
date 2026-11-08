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

Deno.serve(async (request) => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;

  try {
    assertBrowserOrigin(request);
    await requireAdmin(request);

    if (request.method === "GET") {
      const [galleries, orders] = await Promise.all([
        databaseRequest("galleries?select=id,name,type,tariff,status,expires_at,created_at,access_code_encrypted&order=created_at.desc"),
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
      return jsonResponse(request, 200, { galleries: visibleGalleries, orders, orderPhotos });
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
      const tariff = body.tariff;
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
      if (!Number.isInteger(days) || days < 1 || days > 15) {
        return jsonResponse(request, 400, { message: "La durée d’accès doit être comprise entre 1 et 15 jours." });
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
        `galleries?select=id,status,expires_at&id=eq.${encodeURIComponent(galleryId)}&limit=1`
      ) as Array<{ id: string; status: string; expires_at: string }>;
      if (
        !galleries[0] ||
        galleries[0].status !== "open" ||
        Date.parse(galleries[0].expires_at) <= Date.now()
      ) {
        return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
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
        `galleries?select=id,status,expires_at&id=eq.${encodeURIComponent(galleryId)}&limit=1`
      ) as Array<{ id: string; status: string; expires_at: string }>;
      if (
        !galleries[0] ||
        galleries[0].status !== "open" ||
        Date.parse(galleries[0].expires_at) <= Date.now()
      ) {
        return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
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
