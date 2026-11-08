import { quoteDues, Row, todayParis } from "../_shared/commerce-core.ts";
import { formatMoney } from "../_shared/commerce-pdf.ts";
import { databaseRequest, sha256 } from "../_shared/http.ts";

// Fiche de virement de l'acompte ou du solde d'un devis accepté (paiement.html).
// Le lien contient la clé secrète du devis (la même que pour « Répondre à la proposition »).
// Le client peut signaler « J'ai effectué le virement » : Alex est prévenu par e-mail
// et enregistre lui-même le règlement à réception sur son compte.

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
    } catch { /* valeur non standard */ }
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

async function findQuote(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(token)) throw new UserError("Ce lien n'est pas valide.", 404);
  const quote = (await databaseRequest(
    `quotes?select=*&response_token=eq.${encodeURIComponent(token)}&number=not.is.null&limit=1`
  ) as Row[])[0];
  if (!quote) throw new UserError("Ce lien n'est pas valide.", 404);
  if (quote.status !== "accepted") throw new UserError("Ce devis n'est pas encore accepté.", 409);
  return quote;
}

// Montant et référence à indiquer pour le virement.
async function transfer(quote: Row, part: string) {
  const dues = await quoteDues(quote);
  const deposit = part === "acompte";
  const amount = deposit ? dues.depositRemainingCents : dues.balanceRemainingCents;
  const reference = deposit
    ? dues.deposit?.number ?? quote.number
    : dues.final?.number ?? `${quote.number} SOLDE`;
  return { dues, amount, reference };
}

async function view(quote: Row, part: string) {
  const settings = (await databaseRequest("commerce_settings?select=legal_name,iban,bic&id=eq.1") as Row[])[0] ?? {};
  const { dues, amount, reference } = await transfer(quote, part);
  return {
    number: quote.number,
    clientName: quote.client_snapshot?.name ?? "",
    serviceDate: quote.service_date,
    part,
    amountCents: amount,
    dueDate: part === "acompte" ? dues.deposit?.due_date ?? null : quote.service_date,
    invoiceNumber: part === "acompte" ? dues.deposit?.number ?? null : dues.final?.number ?? null,
    holder: settings.legal_name ?? "",
    iban: settings.iban ?? "",
    bic: settings.bic ?? "",
    reference,
    notifiedAt: part === "acompte" ? quote.deposit_transfer_notified_at : quote.balance_transfer_notified_at,
    today: todayParis()
  };
}

async function consumeRateLimit(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnu";
  const attempts = await databaseRequest("rpc/consume_gallery_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_key: await sha256(`quote-transfer:${ip}:${requiredEnv("GALLERY_SESSION_SECRET")}`) })
  }) as number;
  if (attempts > 5) throw new UserError("Trop de tentatives. Réessayez dans quelques minutes.", 429);
}

// « J'ai effectué le virement » : e-mail à Alex pour qu'il vérifie et enregistre le règlement.
async function notify(quote: Row, part: string) {
  const { amount, reference } = await transfer(quote, part);
  await databaseRequest(`quotes?id=eq.${encodeURIComponent(quote.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ [part === "acompte" ? "deposit_transfer_notified_at" : "balance_transfer_notified_at"]: new Date().toISOString() })
  });
  const name = quote.client_snapshot?.name ?? "Le client";
  const text = `${name} indique avoir effectué un virement de ${formatMoney(amount)} (${part === "acompte" ? "acompte" : "solde"}) pour le devis ${quote.number}, avec la référence « ${reference} ».\n\nÀ vérifier sur ton compte bancaire, puis à enregistrer comme règlement sur la facture dans la gestion commerciale.`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: requiredEnv("ORDER_EMAIL_FROM"),
      to: [requiredEnv("CONTACT_EMAIL_TO")],
      subject: `🏦 Virement signalé : ${formatMoney(amount)} — devis ${quote.number} — ${name}`,
      text,
      html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`
    })
  });
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
  return { notified: true };
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
    const quote = await findQuote(body.token);
    const part = body.part === "acompte" ? "acompte" : "solde";
    if (body.action === "get") return reply(request, 200, await view(quote, part));
    if (body.action === "notify") {
      await consumeRateLimit(request);
      return reply(request, 200, await notify(quote, part));
    }
    throw new UserError("Requête invalide.");
  } catch (error) {
    if (error instanceof UserError) return reply(request, error.status, { message: error.message });
    console.error("Quote payment error", error);
    return reply(request, 500, { message: "Une erreur est survenue. Réessayez ou contactez-nous." });
  }
});
