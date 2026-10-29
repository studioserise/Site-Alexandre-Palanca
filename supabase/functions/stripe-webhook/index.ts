import { databaseRequest } from "../_shared/http.ts";

const encoder = new TextEncoder();

type PaidOrder = {
  id: string;
  status: string;
  stripe_checkout_session_id: string;
  customer_email: string;
  download_email_sent_at: string | null;
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Le réglage serveur ${name} est manquant.`);
  return value;
}

async function sendDownloadEmail(order: PaidOrder) {
  if (!["paid_to_prepare", "sent"].includes(order.status)) return;
  if (order.download_email_sent_at) return;

  const frontendOrigin = requiredEnv("FRONTEND_ORIGIN").replace(/\/$/, "");
  const downloadUrl = new URL("/commande-confirmee.html", frontendOrigin);
  downloadUrl.searchParams.set("session_id", order.stripe_checkout_session_id);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `gallery-order-download-${order.id}`
    },
    body: JSON.stringify({
      from: requiredEnv("ORDER_EMAIL_FROM"),
      to: [order.customer_email],
      subject: "Vos photos sont prêtes à télécharger",
      text: [
        "Bonjour,",
        "",
        "Votre paiement est confirmé. Vous pouvez télécharger les photos de votre commande dans une archive ZIP depuis ce lien :",
        "",
        downloadUrl.toString(),
        "",
        "Ce lien donne accès uniquement aux photos de cette commande. Conservez-le et évitez de le partager.",
        "",
        "Alexandre Palanca"
      ].join("\n"),
      html: `<p>Bonjour,</p><p>Votre paiement est confirmé. Téléchargez les photos de votre commande dans une archive ZIP&nbsp;:</p><p><a href="${downloadUrl.toString()}">Télécharger mes photos en ZIP</a></p><p>Ce lien donne accès uniquement aux photos de cette commande. Conservez-le et évitez de le partager.</p><p>Alexandre Palanca</p>`
    })
  });

  if (!response.ok) {
    console.error("Could not send paid order download email", {
      status: response.status
    });
    throw new Error("L’e-mail du lien de téléchargement n’a pas pu être envoyé.");
  }

  await databaseRequest(
    `gallery_orders?id=eq.${encodeURIComponent(order.id)}&download_email_sent_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ download_email_sent_at: new Date().toISOString() })
    }
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

async function isValidStripeSignature(body: string, header: string) {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new Error("La signature webhook Stripe n’est pas configurée.");
  const parts = header.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`)
  ));
  return signatures.some((signature) => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    const actual = Uint8Array.from(
      signature.match(/.{2}/g) ?? [],
      (byte) => Number.parseInt(byte, 16)
    );
    return constantTimeEqual(expected, actual);
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("Stripe-Signature") ?? "";
    if (!await isValidStripeSignature(rawBody, signature)) {
      return new Response("Invalid signature", { status: 400 });
    }

    const event = JSON.parse(rawBody);
    if (event.type === "checkout.session.completed") {
      const session = event.data?.object;
      const orderId = session?.metadata?.order_id;
      if (
        session?.payment_status === "paid" &&
        typeof session.id === "string" &&
        typeof orderId === "string"
      ) {
        const updated = await databaseRequest(
          `gallery_orders?id=eq.${encodeURIComponent(orderId)}&stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}&status=eq.pending_payment`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              status: "paid_to_prepare",
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          }
        ) as Array<{ id: string }>;

        if (!updated.length) {
          const existing = await databaseRequest(
            `gallery_orders?select=id,status,stripe_checkout_session_id&id=eq.${encodeURIComponent(orderId)}&limit=1`
          ) as Array<{ id: string; status: string; stripe_checkout_session_id: string }>;
          if (
            !["paid_to_prepare", "sent", "cancelled_refunded"].includes(existing[0]?.status ?? "") ||
            existing[0]?.stripe_checkout_session_id !== session.id
          ) {
            return new Response("Order could not be confirmed", { status: 409 });
          }
        }

        const orders = await databaseRequest(
          `gallery_orders?select=id,status,stripe_checkout_session_id,customer_email,download_email_sent_at&id=eq.${encodeURIComponent(orderId)}&stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}&limit=1`
        ) as PaidOrder[];
        if (orders[0]) await sendDownloadEmail(orders[0]);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
