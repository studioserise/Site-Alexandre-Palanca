import {
  assertBrowserOrigin,
  databaseRequest,
  errorResponse,
  jsonResponse,
  preflightResponse,
  readGallerySession,
  readJson,
  sha256
} from "../_shared/http.ts";

type Gallery = {
  id: string;
  status: string;
  tariff: string;
  expires_at: string;
};

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Le réglage serveur ${name} est manquant.`);
  return value;
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function stripeRequest(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const secret = requiredEnv("STRIPE_SECRET_KEY");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const stripeError = (result as {
      error?: {
        type?: unknown;
        code?: unknown;
        param?: unknown;
        message?: unknown;
      };
    }).error;
    const type = typeof stripeError?.type === "string" ? stripeError.type : null;
    const code = typeof stripeError?.code === "string" ? stripeError.code : null;
    const param = typeof stripeError?.param === "string" ? stripeError.param : null;
    const rawMessage = typeof stripeError?.message === "string" ? stripeError.message : null;
    const safeMessage = rawMessage
      ?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[adresse masquée]")
      .replace(/\bsk_(?:test|live)_[A-Za-z0-9]+\b/g, "[clé Stripe masquée]")
      .slice(0, 240) ?? null;
    const requestId = response.headers.get("request-id");
    console.error("Stripe Checkout request failed", {
      status: response.status,
      type,
      code,
      param,
      message: safeMessage,
      requestId
    });

    if (code === "invalid_api_key" || code === "api_key_expired" || type === "authentication_error") {
      throw new Error("Stripe refuse la clé secrète configurée. Vérifiez dans Supabase que STRIPE_SECRET_KEY est une clé active du bon environnement (test ou réel).");
    }
    if (code === "currency_not_supported") {
      throw new Error("Le compte Stripe ne prend pas en charge la devise de cette galerie.");
    }

    const reason = code ?? type ?? `HTTP ${response.status}`;
    const parameter = param ? ` — paramètre ${param}` : "";
    const detail = safeMessage ? ` : ${safeMessage}` : "";
    throw new Error(`Stripe a refusé la création de la session (${reason}${parameter})${detail}.`);
  }
  return result as Record<string, unknown>;
}

async function consumeRateLimit(key: string) {
  return await databaseRequest("rpc/consume_gallery_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_key: key })
  }) as number;
}

Deno.serve(async (request) => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;

  let checkoutSessionId: string | null = null;
  try {
    assertBrowserOrigin(request);
    if (request.method !== "POST") {
      return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    }

    const body = await readJson(request);
    const galleryId = await readGallerySession(request);
    if (typeof body.galleryId !== "string" || body.galleryId !== galleryId) {
      return jsonResponse(request, 403, { message: "Galerie non autorisée." });
    }
    if (!validEmail(body.email)) {
      return jsonResponse(request, 400, { message: "Adresse e-mail invalide." });
    }
    if (
      !Array.isArray(body.photoIds) ||
      body.photoIds.length < 1 ||
      body.photoIds.length > 100 ||
      body.photoIds.some((id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      )
    ) {
      return jsonResponse(request, 400, { message: "Sélection de photos invalide." });
    }
    const photoIds = [...new Set(body.photoIds as string[])];
    if (photoIds.length !== body.photoIds.length) {
      return jsonResponse(request, 400, { message: "La sélection contient des doublons." });
    }
    const sessionToken = request.headers.get("Authorization") ?? "";
    const sessionAttempts = await consumeRateLimit(await sha256(`checkout:${sessionToken}`));
    const ip = request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ipAttempts = ip ? await consumeRateLimit(await sha256(`checkout-ip:${ip}`)) : 0;
    if (sessionAttempts > 20 || ipAttempts > 100) {
      return jsonResponse(request, 429, {
        message: "Trop de tentatives de commande. Veuillez réessayer dans 15 minutes."
      });
    }

    const [galleries, photoRows, settings, tiers] = await Promise.all([
      databaseRequest(
        `galleries?select=id,status,tariff,expires_at&id=eq.${encodeURIComponent(galleryId)}&limit=1`
      ),
      databaseRequest(
        `gallery_photos?select=id,photo_number&gallery_id=eq.${encodeURIComponent(galleryId)}&is_active=eq.true&id=in.(${photoIds.join(",")})`
      ),
      databaseRequest(
        "gallery_settings?select=unit_price_cents,currency&id=eq.1&limit=1"
      ),
      databaseRequest(
        "gallery_discount_tiers?select=min_photos,discount_bps&order=min_photos.asc"
      )
    ]) as [
      Gallery[],
      Array<{ id: string; photo_number: number }>,
      Array<{ unit_price_cents: number; currency: string }>,
      Array<{ min_photos: number; discount_bps: number }>
    ];

    const gallery = galleries[0];
    if (!gallery || !["tarif2", "tarif5"].includes(gallery.tariff)) {
      return jsonResponse(request, 400, { message: "Cette galerie ne propose pas de paiement." });
    }
    if (
      gallery.status !== "open" ||
      Date.parse(gallery.expires_at) <= Date.now()
    ) {
      return jsonResponse(request, 410, { message: "Cette galerie est fermée." });
    }
    if (
      photoRows.length !== photoIds.length ||
      !settings[0] ||
      (gallery.tariff === "tarif5" && !tiers.length)
    ) {
      return jsonResponse(request, 400, { message: "Une photo sélectionnée n’est plus disponible." });
    }

    const count = photoRows.length;
    const unitPriceCents = gallery.tariff === "tarif2" ? 200 : 500;
    const subtotalCents = count * unitPriceCents;
    const tier = gallery.tariff === "tarif5" ? tiers
      .filter((item) => count >= item.min_photos)
      .sort((a, b) => b.min_photos - a.min_photos)[0] : undefined;
    const discountBps = tier?.discount_bps ?? 0;
    const discountCents = Math.floor(subtotalCents * discountBps / 10000);
    const totalCents = subtotalCents - discountCents;
    if (totalCents <= 0) {
      return jsonResponse(request, 400, { message: "Le total de la commande est invalide." });
    }

    const created = await databaseRequest("gallery_orders?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        gallery_id: galleryId,
        customer_email: body.email,
        currency: settings[0].currency,
        subtotal_cents: subtotalCents,
        discount_bps: discountBps,
        discount_cents: discountCents,
        total_cents: totalCents
      })
    }) as Array<{ id: string }>;
    const orderId = created[0]?.id;
    if (!orderId) throw new Error("La commande n’a pas pu être enregistrée.");

    try {
      await databaseRequest("gallery_order_photos", {
        method: "POST",
        body: JSON.stringify(photoRows.map((photo) => ({
          order_id: orderId,
          photo_id: photo.id,
          photo_number: photo.photo_number,
          unit_price_cents: unitPriceCents
        })))
      });

      const origin = requiredEnv("FRONTEND_ORIGIN").replace(/\/$/, "");
      const parameters = new URLSearchParams();
      parameters.set("mode", "payment");
      parameters.set("success_url", `${origin}/commande-confirmee.html?session_id={CHECKOUT_SESSION_ID}`);
      parameters.set("cancel_url", `${origin}/galerie-privee.html`);
      parameters.set("customer_email", body.email);
      parameters.set("client_reference_id", orderId);
      parameters.set("metadata[order_id]", orderId);
      parameters.set("line_items[0][price_data][currency]", settings[0].currency);
      parameters.set("line_items[0][price_data][product_data][name]", `${count} photo${count > 1 ? "s" : ""} — galerie privée`);
      parameters.set("line_items[0][price_data][product_data][tax_code]", "txcd_10000000");
      parameters.set("line_items[0][price_data][unit_amount]", String(totalCents));
      parameters.set("line_items[0][quantity]", "1");

      const checkout = await stripeRequest("checkout/sessions", parameters);
      if (typeof checkout.id !== "string" || typeof checkout.url !== "string") {
        throw new Error("Stripe n’a pas renvoyé une session de paiement valide.");
      }
      checkoutSessionId = checkout.id;

      await databaseRequest(
        `gallery_orders?id=eq.${encodeURIComponent(orderId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ stripe_checkout_session_id: checkout.id })
        }
      );
      return jsonResponse(request, 200, { checkoutUrl: checkout.url });
    } catch (error) {
      let expirationFailed = false;
      if (checkoutSessionId) {
        try {
          await stripeRequest(
            `checkout/sessions/${encodeURIComponent(checkoutSessionId)}/expire`,
            new URLSearchParams()
          );
        } catch (expirationError) {
          expirationFailed = true;
          console.error("Could not expire unrecorded Stripe Checkout session", expirationError);
        }
      }
      await databaseRequest(
        `gallery_orders?id=eq.${encodeURIComponent(orderId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "cancelled_refunded" })
        }
      );
      if (expirationFailed) {
        throw new Error("La session de paiement n’a pas pu être annulée après une erreur. Vérifiez Stripe avant de relancer la commande.");
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(request, error);
  }
});
