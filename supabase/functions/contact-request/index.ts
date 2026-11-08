import { databaseRequest, sha256 } from "../_shared/http.ts";

// Formulaire de contact : la demande doit parvenir à Alex dans tous les cas.
// Aucun champ n'est bloquant : ce qui manque ou semble incohérent est signalé dans le mail,
// et l'échange humain clarifiera. Seuls l'anti-spam (champ piège, limite d'envois) et une panne
// technique (envoi du mail impossible) empêchent l'envoi.

// Origines autorisées : le domaine configuré, avec ou sans « www ».
function allowedOrigins() {
  const configured = Deno.env.get("FRONTEND_ORIGIN") ?? "";
  const set = new Set<string>();
  if (configured) {
    set.add(configured);
    try {
      const url = new URL(configured);
      const bare = url.hostname.replace(/^www\./, "");
      set.add(`${url.protocol}//${bare}`);
      set.add(`${url.protocol}//www.${bare}`);
    } catch { /* réglage non standard : on garde la valeur telle quelle */ }
  }
  return set;
}
function cors(request: Request) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  const origin = request.headers.get("Origin") ?? "";
  if (allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return headers;
}
function reply(request: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors(request) });
}

// Rubriques du site et types de prestation proposés dans chaque formulaire.
// Une rubrique ou un type inconnu n'est pas bloquant : il est simplement signalé dans le mail.
const typesByService: Record<string, string[]> = {
  "Photo et vidéo": [
    "Portrait (solo, couple, famille)",
    "Portrait professionnel",
    "Événement privé ou d’entreprise",
    "Concert, spectacle ou festival",
    "Sport et compétition",
    "Lieu, commerce ou savoir-faire",
    "Clip ou projet artistique",
    "Contenus pour les réseaux sociaux",
    "Autre projet"
  ],
  "Sites internet": [
    "Site une page",
    "Site vitrine (plusieurs pages)",
    "Site sur mesure",
    "Refonte d’un site existant",
    "Autre projet"
  ]
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Le réglage serveur ${name} est manquant.`);
  return value;
}

// Lit n'importe quelle valeur comme du texte, coupée à une longueur raisonnable : jamais d'erreur.
function text(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
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
  type: string;
  date: string;
  message: string;
  notes: string;
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
      ...(isEmail(data.email) ? { reply_to: data.email } : {}),
      subject: `Demande de devis — ${data.service || "Site"}${data.type ? ` · ${data.type}` : ""}${data.name ? ` — ${data.name}` : ""}`,
      text: [
        "Nouvelle demande de devis reçue depuis le site.",
        ...(data.notes ? ["", `À vérifier : ${data.notes}`] : []),
        "",
        `Nom : ${data.name || "Non renseigné"}`,
        `E-mail : ${data.email || "Non renseigné"}`,
        `Téléphone : ${data.phone || "Non renseigné"}`,
        `Rubrique : ${data.service}`,
        `Type de prestation : ${data.type || "À préciser ensemble"}`,
        `Date / période souhaitée : ${data.date || "Non renseignée"}`,
        "",
        "Projet :",
        data.message || "(aucun message)"
      ].join("\n"),
      html: `<h1>Nouvelle demande de devis</h1>${safe.notes ? `<p style="padding:10px 12px;background:#fff4d6;border-radius:6px"><strong>À vérifier :</strong> ${safe.notes}</p>` : ""}<p><strong>Nom :</strong> ${safe.name || "Non renseigné"}</p><p><strong>E-mail :</strong> ${safe.email || "Non renseigné"}</p><p><strong>Téléphone :</strong> ${safe.phone || "Non renseigné"}</p><p><strong>Rubrique :</strong> ${safe.service}</p><p><strong>Type de prestation :</strong> ${safe.type || "À préciser ensemble"}</p><p><strong>Date / période souhaitée :</strong> ${safe.date || "Non renseignée"}</p><h2>Projet</h2><p style="white-space:pre-wrap">${safe.message || "(aucun message)"}</p>`
    })
  });

  if (!response.ok) {
    console.error("Resend rejected a contact request", { status: response.status });
    throw new Error(`Resend HTTP ${response.status}`);
  }
}

// Crée la fiche client d'une demande reçue par le site, sauf si une fiche existe déjà pour cet e-mail
// (on complète alors seulement le téléphone s'il manquait). Marquée « formulaire » pour le nettoyage à 6 mois.
async function saveContactClient(name: string, email: string, phone: string) {
  if (!isEmail(email)) return;
  const existing = await databaseRequest(
    `clients?select=id,phone&email=ilike.${encodeURIComponent(email.replace(/[%_*]/g, ""))}&limit=1`
  ) as Array<{ id: string; phone: string }>;
  if (existing[0]) {
    if (!existing[0].phone && phone) {
      await databaseRequest(`clients?id=eq.${encodeURIComponent(existing[0].id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ phone, updated_at: new Date().toISOString() })
      });
    }
    return;
  }
  await databaseRequest("clients", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ type: "particulier", name: (name || email).slice(0, 200), email, phone, source: "formulaire" })
  });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    const ok = allowedOrigins().has(request.headers.get("Origin") ?? "");
    return new Response(null, { status: ok ? 204 : 403, headers: cors(request) });
  }
  let stage = "request";

  try {
    if (!allowedOrigins().has(request.headers.get("Origin") ?? "")) {
      return reply(request, 403, { message: "Origine non autorisée." });
    }
    if (request.method !== "POST") return reply(request, 405, { message: "Méthode non autorisée." });

    // Lecture tolérante : un contenu illisible donne simplement des champs vides.
    let body: Record<string, unknown> = {};
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch { /* champs vides */ }

    // Champ piège invisible rempli : c'est un robot, on fait comme si tout allait bien.
    if (text(body.website, 200)) return reply(request, 200, { ok: true });

    const name = text(body.name, 200);
    const email = text(body.email, 254);
    const phone = text(body.phone, 60);
    const service = text(body.service, 120);
    const type = text(body.type, 120);
    const date = text(body.date, 60);
    const message = text(body.message, 8000);

    // Remarques pour Alex (rien de bloquant)
    const notes: string[] = [];
    if (!name) notes.push("nom non renseigné");
    if (!email) notes.push("e-mail non renseigné");
    else if (!isEmail(email)) notes.push("adresse e-mail peut-être erronée (répondre par téléphone si besoin)");
    if (!email && !phone) notes.push("aucun moyen de recontacter la personne");
    if (!message) notes.push("pas de message");
    if (body.consent !== true) notes.push("case d’accord RGPD non cochée");
    if (type && service && typesByService[service] && !typesByService[service].includes(type)) {
      notes.push("type de prestation inhabituel");
    }

    stage = "rate-limit";
    try {
      if (await consumeRateLimit(request) > 5) {
        return reply(request, 429, { message: "Trop de demandes ont été envoyées. Veuillez réessayer dans 15 minutes." });
      }
    } catch (error) {
      // La limite d'envoi ne doit jamais empêcher une vraie demande d'arriver.
      console.error("Contact rate limit unavailable", { error });
    }

    stage = "email";
    await sendContactEmail({ name, email, phone, service, type, date, message, notes: notes.join(" · ") });

    // Fiche client dans la gestion commerciale (jamais bloquant : le mail est déjà parti).
    stage = "client";
    try {
      await saveContactClient(name, email, phone);
    } catch (error) {
      console.error("Contact client record failed", { error });
    }
    return reply(request, 200, { ok: true });
  } catch (error) {
    console.error("Contact request failed", { stage, error });
    const resendStatus = error instanceof Error ? error.message.match(/Resend HTTP (\d{3})/)?.[1] : undefined;
    return reply(request, 500, {
      message: "La demande n’a pas pu être envoyée.",
      diagnostic: resendStatus ? `RESEND_HTTP_${resendStatus}` : `CONTACT_${stage.toUpperCase().replaceAll("-", "_")}_FAILED`
    });
  }
});
