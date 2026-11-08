import { databaseRequest, sha256 } from "../_shared/http.ts";

// Réponse du client à un devis, depuis la page reponse-devis.html (lien reçu avec le devis).
// Le lien contient une clé secrète propre au devis : sans elle, rien n'est lisible ni modifiable.
// Accepter : le client complète ses coordonnées de facturation (sa fiche est mise à jour).
// Refuser : il peut demander un nouveau devis et laisser un commentaire.
// Alex reçoit un e-mail à chaque réponse.

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

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
    } catch { /* valeur non standard : gardée telle quelle */ }
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

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Le réglage serveur ${name} est manquant.`);
  return value;
}

function text(value: unknown, label: string, max: number, required = false) {
  const value2 = typeof value === "string" ? value.trim() : "";
  if (required && !value2) throw new UserError(`${label} : champ obligatoire.`);
  if (value2.length > max) throw new UserError(`${label} : ${max} caractères maximum.`);
  return value2;
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function escapeHtml(value: string) {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => map[char]);
}

function todayParis() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
}

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);
}

async function rows(path: string, init: RequestInit = {}) {
  return await databaseRequest(path, init) as Row[];
}

async function patch(table: string, id: string, body: Row) {
  await databaseRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() })
  });
}

async function findQuote(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    throw new UserError("Ce lien n'est pas valide.", 404);
  }
  const quote = (await rows(
    `quotes?select=*&response_token=eq.${encodeURIComponent(token)}&number=not.is.null&limit=1`
  ))[0];
  if (!quote) throw new UserError("Ce lien n'est pas valide.", 404);
  const client = quote.client_id
    ? (await rows(`clients?select=*&id=eq.${encodeURIComponent(quote.client_id)}`))[0]
    : null;
  return { quote, client };
}

function stateOf(quote: Row) {
  if (quote.status === "accepted") return "accepted";
  if (quote.status === "refused") return "refused";
  if (quote.status === "expired") return "expired";
  if (quote.status === "sent" && quote.valid_until && quote.valid_until < todayParis()) return "expired";
  return quote.status === "sent" ? "open" : "closed";
}

async function consumeRateLimit(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnu";
  const secret = requiredEnv("GALLERY_SESSION_SECRET");
  const attempts = await databaseRequest("rpc/consume_gallery_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_key: await sha256(`quote-response:${ip}:${secret}`) })
  }) as number;
  if (attempts > 10) throw new UserError("Trop de tentatives. Réessayez dans quelques minutes.", 429);
}

type Section = { title: string; lines: Array<[string, string]> | string[] };

// E-mail de notification envoyé à Alex à chaque réponse (accepté / refusé), avec toutes les infos.
async function notifyAlex(subject: string, headline: string, sections: Section[], replyTo: string) {
  const textBody = [headline, ...sections.flatMap((section) => [
    "", section.title.toUpperCase(),
    ...section.lines.map((line) => Array.isArray(line) ? `${line[0]} : ${line[1] || "—"}` : line)
  ])].join("\n");
  const cell = "padding:4px 14px 4px 0;vertical-align:top";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222222;max-width:620px">
    <p style="font-size:17px"><strong>${escapeHtml(headline)}</strong></p>
    ${sections.map((section) => `<h3 style="margin:22px 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#777777">${escapeHtml(section.title)}</h3>
      ${section.lines.length && Array.isArray(section.lines[0])
        ? `<table style="border-collapse:collapse">${(section.lines as Array<[string, string]>).map(([label, value]) =>
          `<tr><td style="${cell};color:#777777;white-space:nowrap">${escapeHtml(label)}</td><td style="${cell}">${escapeHtml(value || "—").replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`
        : `<p style="margin:0">${(section.lines as string[]).map(escapeHtml).join("<br>").replace(/\n/g, "<br>")}</p>`}`).join("")}
  </div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: requiredEnv("ORDER_EMAIL_FROM"),
      to: [requiredEnv("CONTACT_EMAIL_TO")],
      ...(isEmail(replyTo) ? { reply_to: replyTo } : {}),
      subject,
      text: textBody,
      html
    })
  });
  if (!response.ok) console.error("Resend rejected a quote response notification", response.status);
}

function dateFr(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}

// Partie commune aux deux e-mails : le devis et ses prestations.
async function quoteSection(quote: Row): Promise<Section[]> {
  const items = await rows(
    `quote_items?select=title,quantity,unit,total_ht_cents&quote_id=eq.${encodeURIComponent(quote.id)}&order=position.asc`
  );
  const site = (Deno.env.get("FRONTEND_ORIGIN") ?? "https://alexandrepalanca.fr").replace(/\/$/, "");
  return [
    {
      title: `Devis ${quote.number}`,
      lines: [
        ["Montant total", money(quote.total_ttc_cents)],
        ["Acompte", quote.deposit_enabled && quote.deposit_cents ? money(quote.deposit_cents) : "aucun"],
        ["Date de la prestation", quote.service_period || ""],
        ["Projet", quote.project_description || ""],
        ["Émis le", dateFr(quote.issue_date)],
        ["Valable jusqu'au", dateFr(quote.valid_until)]
      ]
    },
    {
      title: "Prestations",
      lines: items.map((item) =>
        `• ${item.title} — ${Number(item.quantity)} ${item.unit} — ${money(item.total_ht_cents)}`)
    },
    { title: "Gestion commerciale", lines: [`${site}/gestion-commerciale.html`] }
  ];
}

function publicView(quote: Row, client: Row | null) {
  const snapshot = quote.client_snapshot ?? {};
  const source = client ?? snapshot;
  return {
    state: stateOf(quote),
    quote: {
      number: quote.number,
      issueDate: quote.issue_date,
      validUntil: quote.valid_until,
      totalCents: quote.total_ttc_cents,
      depositCents: quote.deposit_enabled ? quote.deposit_cents : 0,
      projectDescription: quote.project_description || "",
      servicePeriod: quote.service_period || ""
    },
    client: {
      type: source.type === "professionnel" ? "professionnel" : "particulier",
      name: source.name ?? "",
      email: source.email ?? "",
      phone: source.phone ?? "",
      address: source.address ?? "",
      postalCode: source.postal_code ?? "",
      city: source.city ?? "",
      country: source.country || "France",
      siret: source.siret ?? "",
      vatNumber: source.vat_number ?? ""
    }
  };
}

async function load(token: unknown) {
  const { quote, client } = await findQuote(token);
  const view = publicView(quote, client);
  const items = await rows(
    `quote_items?select=title,quantity,unit,total_ht_cents&quote_id=eq.${encodeURIComponent(quote.id)}&order=position.asc`
  );
  return { ...view, items: items.map((item) => ({ title: item.title })) };
}

async function accept(body: Row) {
  const { quote, client } = await findQuote(body.token);
  if (stateOf(quote) !== "open") throw new UserError("Ce devis n'attend plus de réponse.", 409);
  const input = body.client ?? {};
  const type = input.type === "professionnel" ? "professionnel" : "particulier";
  const data = {
    type,
    name: text(input.name, type === "professionnel" ? "Nom de la société" : "Nom et prénom", 200, true),
    email: text(input.email, "Adresse e-mail", 254, true),
    phone: text(input.phone, "Téléphone", 40),
    address: text(input.address, "Adresse", 300, true),
    postal_code: text(input.postalCode, "Code postal", 20, true),
    city: text(input.city, "Ville", 120, true),
    country: text(input.country, "Pays", 80) || "France",
    siret: text(input.siret, "SIRET", 20).replace(/\s/g, ""),
    vat_number: text(input.vatNumber, "Numéro de TVA", 30).toUpperCase()
  };
  if (!isEmail(data.email)) throw new UserError("Adresse e-mail invalide.");
  if (type === "professionnel" && !/^\d{14}$/.test(data.siret)) {
    throw new UserError("SIRET invalide : 14 chiffres attendus.");
  }
  if (type === "particulier" && data.siret && !/^\d{9}(\d{5})?$/.test(data.siret)) data.siret = "";
  const comment = text(body.comment, "Commentaire", 3000);

  if (client) await patch("clients", client.id, { ...data, source: "manuel" });
  await patch("quotes", quote.id, {
    status: "accepted",
    responded_at: new Date().toISOString(),
    response_comment: comment,
    response_redo: false
  });

  const before = client ?? {};
  const labels: Record<string, string> = {
    type: "Type", name: "Nom", email: "E-mail", phone: "Téléphone", address: "Adresse",
    postal_code: "Code postal", city: "Ville", country: "Pays", siret: "SIRET", vat_number: "N° de TVA"
  };
  const changed = (Object.keys(data) as Array<keyof typeof data>)
    .filter((key) => String(before[key] ?? "") !== String(data[key] ?? ""))
    .map((key) => labels[key]);
  await notifyAlex(`✅ Devis ${quote.number} accepté — ${data.name}`,
    `${data.name} a accepté le devis ${quote.number} (${money(quote.total_ttc_cents)}).`, [
    { title: "Commentaire du client", lines: [comment || "Aucun commentaire."] },
    {
      title: "Coordonnées de facturation",
      lines: [
        ["Client", `${data.name} (${type})`],
        ["E-mail", data.email],
        ["Téléphone", data.phone],
        ["Adresse", `${data.address}\n${data.postal_code} ${data.city}\n${data.country}`],
        ...(type === "professionnel" ? [["SIRET", data.siret], ["N° de TVA", data.vat_number]] as Array<[string, string]> : [])
      ]
    },
    {
      title: "Fiche client",
      lines: [changed.length ? `Mise à jour automatiquement (${changed.join(", ")}).` : "Aucun changement."]
    },
    ...(await quoteSection(quote)),
    { title: "À faire", lines: ["Le devis est passé en « Accepté » : créez la facture d'acompte depuis la fiche du devis."] }
  ], data.email);
  return { state: "accepted" };
}

async function refuse(body: Row) {
  const { quote, client } = await findQuote(body.token);
  if (stateOf(quote) !== "open") throw new UserError("Ce devis n'attend plus de réponse.", 409);
  const redo = body.redo === true;
  const comment = text(body.comment, "Commentaire", 3000);
  await patch("quotes", quote.id, {
    status: "refused",
    responded_at: new Date().toISOString(),
    response_comment: comment,
    response_redo: redo
  });
  const who = client ?? quote.client_snapshot ?? {};
  const name = who.name || "Le client";
  await notifyAlex(`${redo ? "🔁" : "❌"} Devis ${quote.number} refusé${redo ? " — nouveau devis souhaité" : ""} — ${name}`,
    `${name} a refusé le devis ${quote.number} (${money(quote.total_ttc_cents)}).`, [
    {
      title: "Nouveau devis",
      lines: [redo ? "OUI : le client souhaite recevoir un nouveau devis." : "Non, le client ne demande pas de nouveau devis."]
    },
    { title: "Commentaire du client", lines: [comment || "Aucun commentaire."] },
    {
      title: "Client",
      lines: [
        ["Nom", who.name || ""],
        ["E-mail", who.email || ""],
        ["Téléphone", who.phone || ""]
      ]
    },
    ...(await quoteSection(quote))
  ], who.email || "");
  return { state: "refused" };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: allowedOrigins().has(request.headers.get("Origin") ?? "") ? 204 : 403, headers: cors(request) });
  }
  try {
    if (!allowedOrigins().has(request.headers.get("Origin") ?? "")) throw new UserError("Origine non autorisée.", 403);
    if (request.method !== "POST") throw new UserError("Méthode non autorisée.", 405);
    const body = await request.json().catch(() => null) as Row | null;
    if (!body || typeof body !== "object") throw new UserError("Requête invalide.");
    if (body.action === "get") return reply(request, 200, await load(body.token));
    await consumeRateLimit(request);
    if (body.action === "accept") return reply(request, 200, await accept(body));
    if (body.action === "refuse") return reply(request, 200, await refuse(body));
    throw new UserError("Requête invalide.");
  } catch (error) {
    if (error instanceof UserError) return reply(request, error.status, { message: error.message });
    console.error("Quote response error", error);
    return reply(request, 500, { message: "Une erreur est survenue. Réessayez ou contactez-nous directement." });
  }
});
