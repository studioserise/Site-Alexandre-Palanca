import {
  assertBrowserOrigin,
  createGallerySession,
  databaseRequest,
  errorResponse,
  jsonResponse,
  preflightResponse,
  readJson,
  sha256
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
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (code.length < 4 || code.length > 64) {
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
    if (ipAttempts > 60) {
      return jsonResponse(request, 429, {
        message: "Trop de tentatives. Veuillez réessayer dans 15 minutes."
      });
    }

    const galleries = await databaseRequest(
      `galleries?select=id,status,expires_at&access_code_hash=eq.${hash}&limit=1`
    ) as Array<{ id: string; status: string; expires_at: string }>;
    const gallery = galleries[0];
    if (!gallery) {
      return jsonResponse(request, 404, { message: "Code invalide ou galerie introuvable." });
    }
    if (gallery.status !== "open" || Date.parse(gallery.expires_at) <= Date.now()) {
      return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
    }

    return jsonResponse(request, 200, {
      accessToken: await createGallerySession(gallery.id)
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
