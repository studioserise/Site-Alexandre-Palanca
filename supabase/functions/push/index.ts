// Notifications push — réglages depuis l'application mobile (administrateurs uniquement) :
// clé publique VAPID, abonnement de l'appareil, préférences, notification de test.
import { assertBrowserOrigin, jsonResponse, preflightResponse, readJson } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/admin.ts";
import { vapidKeys } from "../_shared/webpush.ts";
import { deliver, devices, getPrefs, savePrefs, subscribe, unsubscribe } from "../_shared/push-core.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflightResponse(request) ?? new Response(null, { status: 403 });
  try {
    assertBrowserOrigin(request);
    const admin = await requireAdmin(request);
    if (request.method !== "POST") return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    const body = await readJson(request);
    switch (body.action) {
      case "config": {
        const keys = await vapidKeys();
        return jsonResponse(request, 200, { publicKey: keys.publicKey, prefs: await getPrefs(admin.id), devices: await devices(admin.id) });
      }
      case "subscribe":
        return jsonResponse(request, 200, await subscribe(admin.id, body.subscription as Record<string, unknown>, request.headers.get("user-agent") ?? ""));
      case "unsubscribe":
        return jsonResponse(request, 200, await unsubscribe(admin.id, body.endpoint));
      case "save-prefs":
        return jsonResponse(request, 200, { prefs: await savePrefs(admin.id, body.prefs as Record<string, unknown>) });
      case "test": {
        const results = await deliver(admin.id, {
          title: "Notifications activées",
          body: "Vous recevrez ici les rappels du planning, les échéances et ce qui demande votre attention.",
          url: "/app/", tag: "test"
        }, undefined, "high");
        return jsonResponse(request, 200, { results });
      }
      default:
        return jsonResponse(request, 400, { message: "Requête invalide." });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("Origine") || message.includes("Accès administrateur") ? 403
      : message.includes("Session administrateur") ? 401
      : message.includes("invalide") ? 400 : 500;
    if (status >= 500) console.error("Push function error", error);
    return jsonResponse(request, status, { message: status >= 500 ? "Une erreur est survenue." : message });
  }
});
