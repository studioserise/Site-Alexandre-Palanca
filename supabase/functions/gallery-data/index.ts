import {
  assertBrowserOrigin,
  databaseRequest,
  errorResponse,
  jsonResponse,
  preflightResponse,
  readGallerySession
} from "../_shared/http.ts";

type Gallery = {
  id: string;
  name: string;
  type: "event" | "individual";
  tariff: "tarif0" | "tarif2" | "tarif5";
  status: "open" | "closed";
  expires_at: string;
};

Deno.serve(async (request) => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;

  try {
    assertBrowserOrigin(request);
    if (request.method !== "GET") {
      return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    }
    const galleryId = await readGallerySession(request);
    const queryId = encodeURIComponent(galleryId);
    const galleries = await databaseRequest(
      `galleries?select=id,name,type,tariff,status,expires_at&id=eq.${queryId}&limit=1`
    ) as Gallery[];
    const gallery = galleries[0];
    if (
      !gallery ||
      gallery.status !== "open" ||
      Date.parse(gallery.expires_at) <= Date.now()
    ) {
      return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
    }

    const [photos, settings, tiers] = await Promise.all([
      databaseRequest(
        `gallery_photos?select=id,photo_number&gallery_id=eq.${queryId}&is_active=eq.true&order=photo_number.asc`
      ),
      databaseRequest(
        "gallery_settings?select=currency&id=eq.1&limit=1"
      ),
      databaseRequest(
        "gallery_discount_tiers?select=min_photos,discount_bps&order=min_photos.asc"
      )
    ]) as [
      Array<{ id: string; photo_number: number }>,
      Array<{ currency: string }>,
      Array<{ min_photos: number; discount_bps: number }>
    ];

    if (!settings[0] || (gallery.tariff === "tarif5" && !tiers.length)) {
      throw new Error("La grille tarifaire n’est pas configurée.");
    }
    const galleryPhotos = photos.map((photo) => ({
      id: photo.id,
      photoNumber: photo.photo_number
    }));

    return jsonResponse(request, 200, {
      gallery: {
        id: gallery.id,
        name: gallery.name,
        type: gallery.type,
        tariff: gallery.tariff
      },
      photos: galleryPhotos,
      pricing: {
        unitPriceCents: gallery.tariff === "tarif0" ? 0 : gallery.tariff === "tarif2" ? 200 : 500,
        currency: settings[0].currency.toUpperCase(),
        tiers: (gallery.tariff === "tarif5" ? tiers : []).map((tier) => ({
          minPhotos: tier.min_photos,
          discountBps: tier.discount_bps
        }))
      }
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
