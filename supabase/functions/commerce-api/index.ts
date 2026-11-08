import { assertBrowserOrigin, jsonResponse, preflightResponse, readJson } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/admin.ts";
import { handle, UserError } from "../_shared/commerce-core.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  try {
    assertBrowserOrigin(request);
    await requireAdmin(request);
    if (request.method !== "POST") {
      return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    }
    const body = await readJson(request);
    return jsonResponse(request, 200, await handle(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
    const status = error instanceof UserError
      ? error.status
      : message.includes("Origine") || message.includes("Accès administrateur") ? 403
      : message.includes("Session administrateur") ? 401
      : message.includes("invalide") ? 400
      : 500;
    if (status >= 500) console.error("Commerce function error", error);
    return jsonResponse(request, status, {
      message: status >= 500 && !(error instanceof UserError) ? "Une erreur est survenue." : message
    });
  }
});
