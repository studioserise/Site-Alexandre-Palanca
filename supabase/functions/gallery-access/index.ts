import {
  assertBrowserOrigin,
  createGallerySession,
  databaseRequest,
  errorResponse,
  jsonResponse,
  preflightResponse,
  readJson,
  sha256,
  accessCodeKey,
  ACCESS_CODE_MIN,
  ACCESS_CODE_MAX
} from "../_shared/http.ts";

async function consumeRateLimit(key: string) {
  return await databaseRequest("rpc/consume_gallery_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_key: key })
  }) as number;
}

Deno.serve(async (request) => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;

  try {
    assertBrowserOrigin(request);
    if (request.method !== "POST") {
      return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    }
    const body = await readJson(request);
    const code = accessCodeKey(body.code);
    if ([...code].length < ACCESS_CODE_MIN || [...code].length > ACCESS_CODE_MAX) {
      return jsonResponse(request, 400, { message: "Code d’accès invalide." });
    }

    const hash = await sha256(code);
    const ip = request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const sessionSecret = Deno.env.get("GALLERY_SESSION_SECRET");
    if (!sessionSecret || sessionSecret.length < 32) {
      throw new Error("La clé serveur des sessions de galerie n’est pas configurée.");
    }
    const ipAttempts = ip
      ? await consumeRateLimit(await sha256(`ip:${ip}:${sessionSecret}`))
      : 0;
    // Codes courts (3 caractères minimum) : limite par adresse IP (20 essais / 15 min)
    // et limite globale, tous visiteurs confondus (300 essais / 15 min), contre les essais
    // massifs depuis de nombreuses adresses.
    if (ipAttempts > 20) {
      return jsonResponse(request, 429, {
        message: "Trop de tentatives. Veuillez réessayer dans 15 minutes."
      });
    }
    const globalAttempts = await consumeRateLimit(await sha256(`global:${sessionSecret}`));
    if (globalAttempts > 300) {
      return jsonResponse(request, 429, {
        message: "Trop de tentatives. Veuillez réessayer dans 15 minutes."
      });
    }

    const galleries = await databaseRequest(
      `galleries?select=id,status,expires_at,delivery&access_code_hash=eq.${hash}&limit=1`
    ) as Array<{ id: string; status: string; expires_at: string; delivery: string }>;
    const gallery = galleries[0];
    if (!gallery) {
      return jsonResponse(request, 404, { message: "Code invalide ou galerie introuvable." });
    }
    if (gallery.status !== "open" || Date.parse(gallery.expires_at) <= Date.now()) {
      return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
    }

    // Statistique (centre de notifications) : jamais bloquant
    await databaseRequest("rpc/count_gallery_view", {
      method: "POST", body: JSON.stringify({ p_gallery: gallery.id })
    }).catch(() => {});

    return jsonResponse(request, 200, {
      accessToken: await createGallerySession(gallery.id),
      // Livraison vidéo : la page du code affiche une fenêtre de téléchargement (pas de galerie)
      delivery: ["video", "web", "social"].includes(gallery.delivery) ? gallery.delivery : "photos"
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
