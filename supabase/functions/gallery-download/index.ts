import {
  assertBrowserOrigin,
  corsHeaders,
  databaseRequest,
  errorResponse,
  jsonResponse,
  preflightResponse,
  readGallerySession
} from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;

  try {
    assertBrowserOrigin(request);
    if (request.method !== "GET") {
      return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    }

    const requestUrl = new URL(request.url);
    const photoId = requestUrl.searchParams.get("photo_id") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(photoId)) {
      return jsonResponse(request, 400, { message: "Photo invalide." });
    }

    const sessionId = requestUrl.searchParams.get("session_id") ?? "";
    let galleryId: string;
    let orderAuthorized = false;
    if (sessionId) {
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
        return jsonResponse(request, 403, { message: "Référence de paiement invalide." });
      }
      const orders = await databaseRequest(
        `gallery_orders?select=id,gallery_id&stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}&status=in.(paid_to_prepare,sent)&limit=1`
      ) as Array<{ id: string; gallery_id: string }>;
      if (!orders[0]) {
        return jsonResponse(request, 403, { message: "Un paiement confirmé est nécessaire pour télécharger cette photo." });
      }
      const orderPhotos = await databaseRequest(
        `gallery_order_photos?select=photo_id&order_id=eq.${encodeURIComponent(orders[0].id)}&photo_id=eq.${encodeURIComponent(photoId)}&limit=1`
      ) as Array<{ photo_id: string }>;
      if (!orderPhotos.length) {
        return jsonResponse(request, 403, { message: "Cette photo ne fait pas partie de cette commande." });
      }
      galleryId = orders[0].gallery_id;
      orderAuthorized = true;
    } else {
      galleryId = await readGallerySession(request);
    }

    const encodedGalleryId = encodeURIComponent(galleryId);
    const encodedPhotoId = encodeURIComponent(photoId);
    const [galleries, photos] = await Promise.all([
      databaseRequest(
        `galleries?select=id,tariff,status,expires_at&id=eq.${encodedGalleryId}&limit=1`
      ) as Promise<Array<{ id: string; tariff: string; status: string; expires_at: string }>>,
      databaseRequest(
        `gallery_photos?select=id,photo_number,original_path,is_active&gallery_id=eq.${encodedGalleryId}&id=eq.${encodedPhotoId}&limit=1`
      ) as Promise<Array<{ id: string; photo_number: number; original_path: string; is_active: boolean }>>
    ]);

    const gallery = galleries[0];
    const photo = photos[0];
    if (!gallery || !photo) {
      return jsonResponse(request, 404, { message: "Photo introuvable." });
    }

    if (!orderAuthorized && gallery.tariff === "tarif0") {
      if (
        gallery.status !== "open" ||
        Date.parse(gallery.expires_at) <= Date.now() ||
        !photo.is_active
      ) {
        return jsonResponse(request, 410, { message: "Cette galerie ou cette photo n’est plus disponible." });
      }
    } else if (!orderAuthorized) {
      return jsonResponse(request, 403, { message: "Un paiement confirmé est nécessaire pour télécharger cette photo." });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const bucket = Deno.env.get("GALLERY_ORIGINALS_BUCKET") || "gallery-originals";
    if (!url || !serviceKey) {
      return jsonResponse(request, 503, { message: "Le service de fichiers n’est pas configuré." });
    }
    const extension = photo.original_path.split(".").at(-1)?.toLowerCase();
    if (!extension || !["jpg", "jpeg", "png", "webp"].includes(extension)) {
      return jsonResponse(request, 415, { message: "Format de fichier non autorisé." });
    }
    const encodedPath = photo.original_path.split("/").map(encodeURIComponent).join("/");
    const fileResponse = await fetch(
      `${url.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encodedPath}`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        }
      }
    );
    if (!fileResponse.ok) {
      console.error("Could not retrieve authorized gallery original", fileResponse.status);
      return jsonResponse(request, 502, { message: "Le fichier haute résolution n’a pas pu être récupéré." });
    }

    const contentType = fileResponse.headers.get("Content-Type")?.split(";")[0] ?? "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      return jsonResponse(request, 415, { message: "Format de fichier non autorisé." });
    }
    const headers = corsHeaders(request);
    headers.set("Content-Type", contentType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="photo-${String(photo.photo_number).padStart(3, "0")}.${extension}"`
    );
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(fileResponse.body, { status: 200, headers });
  } catch (error) {
    return errorResponse(request, error);
  }
});
