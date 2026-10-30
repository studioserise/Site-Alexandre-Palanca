import {
  assertBrowserOrigin,
  databaseRequest,
  jsonResponse,
  preflightResponse,
  readJson,
  sha256
} from "../_shared/http.ts";

const services = new Set([
  "Portraits",
  "Événementiel",
  "Vidéos",
  "Lieux & marques",
  "Autre"
]);

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Le réglage serveur ${name} est manquant.`);
  return value;
}

function readOptionalString(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(`${label} invalide.`);
  }
  return value.trim();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return character;
    }
  });
}

function validateDate(value: string) {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("La date souhaitée est invalide.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error("La date souhaitée est invalide.");
  return value;
}

async function consumeRateLimit(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) throw new Error("L’envoi du formulaire est momentanément indisponible.");

  const secret = requiredEnv("GALLERY_SESSION_SECRET");
  if (secret.length < 32) throw new Error("Le réglage serveur de limitation est invalide.");
  return await databaseRequest("rpc/consume_gallery_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_key: await sha256(`contact:${ip}:${secret}`) })
  }) as number;
}

async function sendContactEmail(data: {
  name: string;
  email: string;
  phone: string;
  service: string;
  date: string;
  message: string;
}) {
  const safe = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, escapeHtml(value)])
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: requiredEnv("ORDER_EMAIL_FROM"),
      to: [requiredEnv("CONTACT_EMAIL_TO")],
      reply_to: data.email,
      subject: `Demande de devis — ${data.service}`,
      text: [
        "Nouvelle demande de devis reçue depuis le site.",
        "",
        `Nom : ${data.name}`,
        `E-mail : ${data.email}`,
        `Téléphone : ${data.phone || "Non renseigné"}`,
        `Prestation : ${data.service}`,
        `Date / période souhaitée : ${data.date || "Non renseignée"}`,
        "",
        "Projet :",
        data.message
      ].join("\n"),
      html: `<h1>Nouvelle demande de devis</h1><p><strong>Nom :</strong> ${safe.name}</p><p><strong>E-mail :</strong> ${safe.email}</p><p><strong>Téléphone :</strong> ${safe.phone || "Non renseigné"}</p><p><strong>Prestation :</strong> ${safe.service}</p><p><strong>Date / période souhaitée :</strong> ${safe.date || "Non renseignée"}</p><h2>Projet</h2><p style="white-space:pre-wrap">${safe.message}</p>`
    })
  });

  if (!response.ok) {
    console.error("Resend rejected a contact request", { status: response.status });
    throw new Error(`Resend HTTP ${response.status}`);
  }
}

Deno.serve(async (request) => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  let stage = "request";

  try {
    assertBrowserOrigin(request);
    if (request.method !== "POST") {
      return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 12_000) {
      return jsonResponse(request, 413, { message: "Le formulaire est trop volumineux." });
    }

    const body = await readJson(request);
    if (typeof body.website === "string" && body.website.trim()) {
      return jsonResponse(request, 200, { ok: true });
    }

    const name = readOptionalString(body.name, "Nom", 100);
    const email = readOptionalString(body.email, "Adresse e-mail", 254);
    const phone = readOptionalString(body.phone, "Téléphone", 30);
    const service = readOptionalString(body.service, "Prestation", 80);
    const date = validateDate(readOptionalString(body.date, "Date", 10));
    const message = readOptionalString(body.message, "Message", 4000);

    if (name.length < 2) throw new Error("Veuillez renseigner votre nom.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Veuillez renseigner une adresse e-mail valide.");
    }
    if (service && !services.has(service)) throw new Error("Veuillez choisir une prestation valide.");
    if (!service) throw new Error("Veuillez choisir une prestation.");
    if (!message) throw new Error("Veuillez décrire votre projet.");
    if (body.consent !== true) throw new Error("Votre accord est nécessaire pour traiter la demande.");

    stage = "rate-limit";
    if (await consumeRateLimit(request) > 5) {
      return jsonResponse(request, 429, {
        message: "Trop de demandes ont été envoyées. Veuillez réessayer dans 15 minutes."
      });
    }

    stage = "email";
    await sendContactEmail({ name, email, phone, service, date, message });
    return jsonResponse(request, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    const status =
      message.includes("Origine") ? 403 :
      message.includes("invalide") || message.includes("Veuillez") || message.includes("accord") ? 400 :
      message.includes("Trop") ? 429 :
      500;
    if (status === 500) console.error("Contact request failed", { stage, error });
    const resendStatus = message.match(/Resend HTTP (\d{3})/)?.[1];
    return jsonResponse(request, status, {
      message: status === 500
        ? "La demande n’a pas pu être envoyée. Réessayez dans quelques instants."
        : message,
      diagnostic: status === 500
        ? resendStatus
          ? `RESEND_HTTP_${resendStatus}`
          : `CONTACT_${stage.toUpperCase().replaceAll("-", "_")}_FAILED`
        : undefined
    });
  }
});
