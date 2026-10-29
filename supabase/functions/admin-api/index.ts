import {
  assertBrowserOrigin,
  databaseRequest,
  errorResponse,
  jsonResponse,
  preflightResponse,
  readJson,
  sha256
} from "../_shared/http.ts";

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
        databaseRequest("galleries?select=id,name,type,tariff,status,expires_at,created_at&order=created_at.desc"),
        databaseRequest("gallery_orders?select=id,gallery_id,customer_email,status,currency,subtotal_cents,discount_bps,discount_cents,total_cents,created_at,paid_at,sent_at&order=created_at.desc")
      ]);
      const orderIds = (orders as Array<{ id: string }>).map((order) => order.id);
      let orderPhotos: unknown[] = [];
      if (orderIds.length) {
        orderPhotos = await databaseRequest(
          `gallery_order_photos?select=order_id,photo_number&order_id=in.(${orderIds.join(",")})&order=photo_number.asc`
        ) as unknown[];
      }
      return jsonResponse(request, 200, { galleries, orders, orderPhotos });
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
      if (!/^[A-Z0-9-]{10,64}$/.test(code)) {
        return jsonResponse(request, 400, {
          message: "Le code doit contenir 10 à 64 lettres, chiffres ou tirets."
        });
      }
      const days = Number(body.daysOpen);
      if (!Number.isInteger(days) || days < 1 || days > 15) {
        return jsonResponse(request, 400, { message: "La durée d’accès doit être comprise entre 1 et 15 jours." });
      }
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const created = await databaseRequest("galleries?select=id,name,type,tariff,status,expires_at", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name,
          type,
          tariff,
          access_code_hash: await sha256(code),
          expires_at: expiresAt
        })
      }) as Array<{ id: string; name: string; type: string; status: string; expires_at: string }>;
      return jsonResponse(request, 201, { gallery: created[0], accessCode: code });
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
