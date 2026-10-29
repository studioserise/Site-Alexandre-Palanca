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

    const galleryId = await readGallerySession(request);
    const photoId = new URL(request.url).searchParams.get("photo_id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(photoId)) {
      return jsonResponse(request, 400, { message: "Photo invalide." });
    }
    const galleryQuery = encodeURIComponent(galleryId);
    const photoQuery = encodeURIComponent(photoId);
    const [galleries, photos] = await Promise.all([
      databaseRequest(
        `galleries?select=id,status,expires_at&id=eq.${galleryQuery}&limit=1`
      ) as Promise<Array<{ id: string; status: string; expires_at: string }>>,
      databaseRequest(
        `gallery_photos?select=preview_path&gallery_id=eq.${galleryQuery}&id=eq.${photoQuery}&is_active=eq.true&limit=1`
      ) as Promise<Array<{ preview_path: string }>>
    ]);

    if (
      !galleries[0] ||
      galleries[0].status !== "open" ||
      Date.parse(galleries[0].expires_at) <= Date.now()
    ) {
      return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
    }
    if (!photos[0]) {
      return jsonResponse(request, 404, { message: "Aperçu introuvable." });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const bucket = Deno.env.get("GALLERY_PREVIEW_BUCKET") || "gallery-previews";
    if (!url || !serviceKey) {
      return jsonResponse(request, 503, { message: "Le service de fichiers n’est pas configuré." });
    }
    const encodedPath = photos[0].preview_path.split("/").map(encodeURIComponent).join("/");
    const imageResponse = await fetch(
      `${url.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encodedPath}`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`
        }
      }
    );
    if (!imageResponse.ok) {
      console.error("Could not retrieve private gallery preview", imageResponse.status);
      return jsonResponse(request, 502, { message: "L’aperçu n’a pas pu être chargé." });
    }

    const contentType = imageResponse.headers.get("Content-Type") ?? "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType.split(";")[0])) {
      return jsonResponse(request, 415, { message: "Format d’aperçu non autorisé." });
    }
    const headers = corsHeaders(request);
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(imageResponse.body, {
      status: 200,
      headers
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
