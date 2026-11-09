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
  delivery: "photos" | "video" | "web" | "social";
  video_links: Array<{ label: string; url: string; multiple?: boolean }>;
  web_pages: Array<{ name: string; url: string }>;
  feedback_rounds: number;
  social_folders: Array<{ label: string; url: string; description: string }>;
  tutorial_path: string | null;
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
      `galleries?select=id,name,type,tariff,status,expires_at,delivery,video_links,web_pages,feedback_rounds,social_folders,tutorial_path&id=eq.${queryId}&limit=1`
    ) as Gallery[];
    const gallery = galleries[0];
    if (
      !gallery ||
      gallery.status !== "open" ||
      Date.parse(gallery.expires_at) <= Date.now()
    ) {
      return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
    }

    // Suivi de site web : pages à afficher dans un cadre et retours déjà envoyés
    if (gallery.delivery === "web") {
      const feedback = await databaseRequest(
        `web_feedback?select=round,entries,final_comment,submitted_at&gallery_id=eq.${queryId}&order=round.asc`
      ) as Array<Record<string, unknown>>;
      return jsonResponse(request, 200, {
        gallery: { id: gallery.id, name: gallery.name, delivery: "web", expiresAt: gallery.expires_at },
        pages: gallery.web_pages ?? [],
        roundsIncluded: gallery.feedback_rounds,
        feedback
      });
    }

    // Contenus réseaux : dossiers (liens) et guide PDF (lien signé valable 8 h)
    if (gallery.delivery === "social") {
      if (new URL(request.url).searchParams.get("compter") === "video") {
        await databaseRequest("rpc/count_gallery_download", {
          method: "POST", body: JSON.stringify({ p_gallery: gallery.id })
        }).catch(() => {});
        return jsonResponse(request, 200, { ok: true });
      }
      let tutorialUrl: string | null = null;
      if (gallery.tutorial_path) {
        const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
        const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const path = gallery.tutorial_path.split("/").map(encodeURIComponent).join("/");
        const signed = await fetch(`${base}/storage/v1/object/sign/client-documents/${path}`, {
          method: "POST",
          headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn: 8 * 3600 })
        });
        const result = await signed.json().catch(() => ({}));
        if (signed.ok && result.signedURL) tutorialUrl = `${base}/storage/v1${result.signedURL}`;
      }
      return jsonResponse(request, 200, {
        gallery: { id: gallery.id, name: gallery.name, delivery: "social", expiresAt: gallery.expires_at },
        folders: gallery.social_folders ?? [],
        tutorialUrl
      });
    }

    // Livraison vidéo : seulement les liens de téléchargement (aucun fichier stocké ici).
    // ?compter=video : un clic sur « Télécharger » est compté pour les statistiques.
    if (gallery.delivery === "video") {
      if (new URL(request.url).searchParams.get("compter") === "video") {
        await databaseRequest("rpc/count_gallery_download", {
          method: "POST", body: JSON.stringify({ p_gallery: gallery.id })
        }).catch(() => {});
        return jsonResponse(request, 200, { ok: true });
      }
      return jsonResponse(request, 200, {
        gallery: { id: gallery.id, name: gallery.name, type: gallery.type, tariff: "tarif0", delivery: "video" },
        videos: (gallery.video_links ?? []).map((video, index) => ({
          label: video.label || ((gallery.video_links ?? []).length > 1
            ? `Vidéo${video.multiple ? "s" : ""} ${index + 1}`
            : video.multiple ? "Vos vidéos" : "Votre vidéo"),
          url: video.url,
          multiple: video.multiple === true
        })),
        photos: [],
        pricing: { unitPriceCents: 0, currency: "EUR", tiers: [] }
      });
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
