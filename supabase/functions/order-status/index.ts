import {
  assertBrowserOrigin,
  databaseRequest,
  errorResponse,
  jsonResponse,
  preflightResponse
} from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;

  try {
    assertBrowserOrigin(request);
    if (request.method !== "GET") {
      return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    }
    const checkoutSessionId = new URL(request.url).searchParams.get("session_id") ?? "";
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(checkoutSessionId)) {
      return jsonResponse(request, 400, { message: "Référence de paiement invalide." });
    }
    const orders = await databaseRequest(
      `gallery_orders?select=id,status,total_cents,currency,created_at,stripe_checkout_session_id&stripe_checkout_session_id=eq.${encodeURIComponent(checkoutSessionId)}&limit=1`
    ) as Array<{
      id: string;
      status: string;
      total_cents: number;
      currency: string;
      created_at: string;
    }>;
    if (!orders[0]) {
      return jsonResponse(request, 404, { message: "Commande introuvable." });
    }
    let photos: Array<{ photoId: string; photoNumber: number }> = [];
    if (["paid_to_prepare", "sent"].includes(orders[0].status)) {
      const orderPhotos = await databaseRequest(
        `gallery_order_photos?select=photo_id,photo_number&order_id=eq.${encodeURIComponent(orders[0].id)}&order=photo_number.asc`
      ) as Array<{ photo_id: string; photo_number: number }>;
      photos = orderPhotos.map((photo) => ({
        photoId: photo.photo_id,
        photoNumber: photo.photo_number
      }));
    }
    return jsonResponse(request, 200, {
      status: orders[0].status,
      totalCents: orders[0].total_cents,
      currency: orders[0].currency.toUpperCase(),
      photos
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
