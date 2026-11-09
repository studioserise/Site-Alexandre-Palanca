import { databaseRequest, sha256 } from "../_shared/http.ts";
import { signQuotePdf } from "../_shared/commerce-pdf.ts";
import { getSettings, invoiceFromQuote, issueInvoice, issuerFrom, issuerName, issuerReplyTo, longDateFr, serviceSummary } from "../_shared/commerce-core.ts";

const BUCKET = "commerce-documents";

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
async function notifyAlex(
  subject: string, headline: string, sections: Section[], replyTo: string,
  attachments: Array<{ filename: string; content: string }> = [],
  // deno-lint-ignore no-explicit-any
  issuerSettings: Record<string, any>
) {
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
      from: issuerFrom(issuerSettings),
      to: [issuerReplyTo(issuerSettings)],
      ...(isEmail(replyTo) ? { reply_to: replyTo } : {}),
      subject,
      text: textBody,
      html,
      ...(attachments.length ? { attachments } : {})
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
        ["Prestation", serviceSummary(quote)],
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
    issuerName: quote.issuer === "elisa" ? "Elisa Martignac" : "Alexandre Palanca",
    quote: {
      number: quote.number,
      issueDate: quote.issue_date,
      validUntil: quote.valid_until,
      totalCents: quote.total_ttc_cents,
      depositCents: quote.deposit_enabled ? quote.deposit_cents : 0,
      projectDescription: quote.project_description || "",
      servicePeriod: serviceSummary(quote)
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


// E-mail au client après sa signature : copie du devis signé, facture d'acompte, bouton de paiement.
async function sendClientConfirmation(
  data: Row, quote: Row, deposit: Row | null, payUrl: string,
  attachments: Array<{ filename: string; content: string }>,
  issuerSettings: Row
) {
  const firstName = data.type === "professionnel" ? "" : String(data.name).split(/\s+/)[0];
  const lines = [
    firstName ? `Bonjour ${firstName},` : "Bonjour,",
    "",
    `Merci pour votre confiance ! Votre acceptation du devis ${quote.number} a bien été enregistrée. Vous trouverez ci-joint :`,
    "— une copie de votre devis signé ;",
    ...(deposit ? [`— la facture d'acompte ${deposit.number} de ${money(deposit.amount_due_cents)}.`] : []),
    "",
    ...(deposit
      ? [
        `L'acompte confirme la réservation de votre date. Il est à régler au plus tard le ${longDateFr(deposit.due_date)} (72 h avant la prestation), par carte bancaire ou par virement, grâce au bouton ci-dessous.`,
        ""
      ]
      : []),
    "Je reviendrai vers vous quelques jours avant le rendez-vous pour vous en rappeler les détails.",
    "",
    "Bien cordialement,",
    issuerName(issuerSettings)
  ];
  const button = payUrl
    ? `<p style="margin:28px 0"><a href="${escapeHtml(payUrl)}" style="display:inline-block;padding:15px 30px;background:#111111;color:#ffffff;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none">Régler l'acompte (${escapeHtml(money(deposit!.amount_due_cents))})</a></p>
      <p style="color:#777777;font-size:12px">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${escapeHtml(payUrl)}</p>`
    : "";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: issuerFrom(issuerSettings),
      to: [data.email],
      reply_to: issuerReplyTo(issuerSettings),
      subject: deposit
        ? `Votre devis ${quote.number} signé et votre facture d'acompte — ${issuerName(issuerSettings)}`
        : `Votre devis ${quote.number} signé — ${issuerName(issuerSettings)}`,
      text: lines.join("\n") + (payUrl ? `\n\nRégler l'acompte (carte ou virement) : ${payUrl}` : ""),
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222">
        <p>${lines.map(escapeHtml).join("<br>")}</p>${button}</div>`,
      attachments
    })
  });
  if (!response.ok) console.error("Resend rejected the client confirmation", response.status);
}

async function storage(path: string, init: RequestInit = {}) {
  const url = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return await fetch(`${url}/storage/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers }
  });
}
const objectPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

// Signature dessinée sur la page : image PNG (data URL), taille raisonnable.
function signaturePng(value: unknown) {
  const match = typeof value === "string" ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value) : null;
  if (!match || match[1].length > 700_000) throw new UserError("Merci de signer dans le cadre avant de confirmer.");
  const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
  if (bytes.length < 600) throw new UserError("Merci de signer dans le cadre avant de confirmer.");
  return bytes;
}

async function hexSha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function accept(body: Row, request: Request) {
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
  const png = signaturePng(body.signature);

  // Devis signé : signature posée sur le PDF d'origine, archivé à côté de lui (preuve d'acceptation).
  if (!quote.pdf_path) throw new UserError("Ce devis n'est pas disponible. Contactez-nous directement.", 409);
  const original = await storage(`object/${BUCKET}/${objectPath(quote.pdf_path)}`);
  if (!original.ok) throw new Error(`PDF du devis introuvable (${original.status})`);
  const originalBytes = new Uint8Array(await original.arrayBuffer());
  const signedAt = new Date();
  const signed = await signQuotePdf(originalBytes, {
    png,
    name: data.name,
    email: data.email,
    signedAt,
    ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    userAgent: request.headers.get("user-agent") ?? "",
    number: quote.number,
    originalSha256: await hexSha256(originalBytes)
  });
  const signedPath = quote.pdf_path.replace(/\.pdf$/i, "") + `_signe_${signedAt.getTime()}.pdf`;
  const upload = await storage(`object/${BUCKET}/${objectPath(signedPath)}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", "x-upsert": "false" },
    body: signed as BodyInit
  });
  if (!upload.ok) throw new Error(`Archivage du devis signé impossible (${upload.status})`);

  if (client) await patch("clients", client.id, { ...data, source: "manuel" });
  await patch("quotes", quote.id, {
    status: "accepted",
    responded_at: signedAt.toISOString(),
    response_comment: comment,
    response_redo: false,
    signed_pdf_path: signedPath,
    signed_at: signedAt.toISOString()
  });

  // Facture d'acompte émise automatiquement (au plus tard 72 h avant la prestation).
  let deposit: Row | null = null;
  let depositPdf: Uint8Array | null = null;
  let depositError = "";
  if (quote.deposit_enabled && quote.deposit_cents > 0) {
    try {
      const draft = await invoiceFromQuote(quote.id, "deposit");
      deposit = await issueInvoice(draft.id);
      const file = await storage(`object/${BUCKET}/${objectPath(deposit!.pdf_path)}`);
      if (file.ok) depositPdf = new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      console.error("Deposit invoice could not be issued", error);
      depositError = error instanceof Error ? error.message : "erreur inconnue";
    }
  }
  const site = requiredEnv("FRONTEND_ORIGIN").replace(/\/$/, "");
  const payUrl = deposit ? `${site}/paiement.html?t=${encodeURIComponent(String(body.token))}&p=acompte` : "";
  const fileSafe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const signedAttachment = { filename: fileSafe(`Devis ${quote.number} signé ${data.name}.pdf`), content: toBase64(signed) };
  const depositAttachment = deposit && depositPdf
    ? { filename: fileSafe(`Facture d'acompte ${deposit.number} ${data.name}.pdf`), content: toBase64(depositPdf) }
    : null;

  // Copie au client : devis signé, facture d'acompte et lien de paiement.
  const issuerSettings = await getSettings(quote.issuer);
  await sendClientConfirmation(data, quote, deposit, payUrl, [signedAttachment, ...(depositAttachment ? [depositAttachment] : [])], issuerSettings);

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
    { title: "Devis signé", lines: ["Le devis signé et daté est joint à cet e-mail (preuve d'acceptation, avec une page d'attestation). Il est aussi archivé dans la fiche du devis."] },
    {
      title: "Facture d'acompte",
      lines: [deposit
        ? `${deposit.number} (${money(deposit.amount_due_cents)}) émise automatiquement, jointe à cet e-mail, à régler au plus tard le ${longDateFr(deposit.due_date)}. Le client l'a reçue avec son devis signé et le lien de paiement (carte ou virement).`
        : depositError
        ? `Elle n'a pas pu être émise automatiquement (${depositError}) : créez-la depuis la fiche du devis.`
        : "Pas d'acompte prévu sur ce devis."]
    }
  ], data.email, [signedAttachment, ...(depositAttachment ? [depositAttachment] : [])], issuerSettings);
  return { state: "accepted", payUrl, depositCents: deposit?.amount_due_cents ?? 0 };
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
  ], who.email || "", [], await getSettings(quote.issuer));
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
    if (body.action === "accept") return reply(request, 200, await accept(body, request));
    if (body.action === "refuse") return reply(request, 200, await refuse(body));
    throw new UserError("Requête invalide.");
  } catch (error) {
    if (error instanceof UserError) return reply(request, error.status, { message: error.message });
    console.error("Quote response error", error);
    return reply(request, 500, { message: "Une erreur est survenue. Réessayez ou contactez-nous directement." });
  }
});
