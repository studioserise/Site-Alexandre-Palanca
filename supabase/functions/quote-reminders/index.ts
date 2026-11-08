import { databaseRequest } from "../_shared/http.ts";
import { formatMoney } from "../_shared/commerce-pdf.ts";
import { quoteDues, Row, serviceWhen, todayParis, addDays } from "../_shared/commerce-core.ts";

// Rappels au client avant la prestation (devis acceptés avec une date de prestation) :
// - 72 h avant : rendez-vous (date, heure, lieu) + acompte à régler s'il ne l'est pas ;
// - 24 h avant : rendez-vous + règlement du solde (par virement avant, ou sur place en espèces / virement).
// Toutes les heures (pg_cron), les rappels arrivés à échéance sont préparés et envoyés à Alex pour
// validation. Le client ne reçoit rien tant qu'Alex n'a pas cliqué « Envoyer au client » sur rappel.html.

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
const site = () => requiredEnv("FRONTEND_ORIGIN").replace(/\/$/, "");

function escapeHtml(value: string) {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => map[char]);
}

async function rows(path: string, init: RequestInit = {}) {
  return await databaseRequest(path, init) as Row[];
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// Heure de Paris → instant UTC (heure par défaut : 9 h si elle n'est pas renseignée).
function parisInstant(isoDate: string, time: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = (time || "09:00").split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
  const asParis = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return guess - (asParis - guess);
}

async function sendEmail(payload: Row) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: requiredEnv("ORDER_EMAIL_FROM"), ...payload })
  });
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
}

function button(url: string, label: string) {
  return `<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 30px;background:#111111;color:#ffffff;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none">${escapeHtml(label)}</a></p>`;
}

async function clientOf(quote: Row) {
  const client = quote.client_id ? (await rows(`clients?select=*&id=eq.${encodeURIComponent(quote.client_id)}`))[0] : null;
  return client ?? quote.client_snapshot ?? {};
}

function where(quote: Row) {
  return `${serviceWhen(quote)}${quote.service_location ? `, à ${quote.service_location}` : ""}`;
}

// Texte proposé par défaut (Alex peut le modifier avant l'envoi).
async function defaultMessage(kind: string, quote: Row, client: Row) {
  const firstName = client.type === "professionnel" ? "" : String(client.name ?? "").trim().split(/\s+/)[0];
  const hello = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const dues = await quoteDues(quote);
  if (kind === "j3") {
    return [
      hello, "",
      `Je me permets de vous rappeler notre rendez-vous du ${where(quote)}.`, "",
      dues.depositRemainingCents > 0
        ? `Votre acompte de ${formatMoney(dues.depositRemainingCents)}${dues.deposit ? ` (facture ${dues.deposit.number})` : ""} n'a pas encore été réglé : merci de le régler dès maintenant par virement pour confirmer la réservation. Les coordonnées bancaires sont sur la fiche de virement (bouton ci-dessous).`
        : "Votre acompte a bien été reçu, merci.",
      "",
      "N'hésitez pas à me contacter si vous avez la moindre question.", "",
      "Bien cordialement,", "Alexandre Palanca"
    ].join("\n");
  }
  const today = todayParis();
  const day = quote.service_date === today ? "aujourd'hui" : quote.service_date === addDays(today, 1) ? "demain" : "bientôt";
  return [
    hello, "",
    `Petit rappel : nous avons rendez-vous ${day}, ${where(quote)}.`, "",
    ...(dues.balanceRemainingCents > 0
      ? [
        dues.depositRemainingCents > 0
          ? `Il reste ${formatMoney(dues.balanceRemainingCents)} à régler (acompte compris). Vous pouvez au choix :`
          : `Pour le solde de ${formatMoney(dues.balanceRemainingCents)}, vous pouvez au choix :`,
        "— le régler dès maintenant par virement (coordonnées sur la fiche de virement, bouton ci-dessous) ;",
        "— le régler sur place au moment de la prestation, en espèces ou par virement."
      ]
      : ["Tout est déjà réglé, merci !"]),
    "",
    day === "demain" ? "À demain !" : "À très vite !", "",
    "Bien cordialement,", "Alexandre Palanca"
  ].join("\n");
}

// Bouton de paiement ajouté au rappel selon ce qui reste à payer au moment de l'envoi.
async function paymentButton(kind: string, quote: Row) {
  const dues = await quoteDues(quote);
  const amount = kind === "j3" ? dues.depositRemainingCents : dues.balanceRemainingCents;
  if (amount <= 0) return null;
  let token = quote.response_token as string | null;
  if (!token) {
    token = randomToken();
    await databaseRequest(`quotes?id=eq.${encodeURIComponent(quote.id)}`, {
      method: "PATCH", body: JSON.stringify({ response_token: token })
    });
  }
  return {
    url: `${site()}/paiement.html?t=${encodeURIComponent(token)}&p=${kind === "j3" ? "acompte" : "solde"}`,
    label: kind === "j3" ? `Régler l'acompte par virement (${formatMoney(amount)})` : `Régler par virement (${formatMoney(amount)})`
  };
}

const KIND_LABEL: Record<string, string> = { j3: "72 h avant (J-3)", j1: "24 h avant (J-1)" };

// ---------------------------------------------------------------- préparation (toutes les heures)

async function prepare() {
  const today = todayParis();
  const quotes = await rows(
    `quotes?select=*&status=eq.accepted&service_date=gte.${today}&service_date=lte.${addDays(today, 4)}`
  );
  const prepared: string[] = [];
  for (const quote of quotes) {
    const hoursLeft = (parisInstant(quote.service_date, quote.service_time) - Date.now()) / 3_600_000;
    if (hoursLeft <= 0) continue;
    const kind = hoursLeft <= 24 ? "j1" : hoursLeft <= 72 ? "j3" : null;
    if (!kind) continue;
    const existing = await rows(`quote_reminders?select=kind&quote_id=eq.${quote.id}`);
    if (existing.some((entry) => entry.kind === kind)) continue;
    const client = await clientOf(quote);
    if (!client.email) continue;
    const message = await defaultMessage(kind, quote, client);
    const token = randomToken();
    await databaseRequest("quote_reminders", {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify({ quote_id: quote.id, kind, token, message })
    });
    const link = `${site()}/rappel.html?t=${token}`;
    const intro = `Le rappel ${KIND_LABEL[kind]} pour ${client.name} (devis ${quote.number}, rendez-vous le ${where(quote)}) est prêt. Il ne partira chez le client qu'après ta validation.`;
    await sendEmail({
      to: [requiredEnv("CONTACT_EMAIL_TO")],
      subject: `À valider : rappel ${kind === "j3" ? "J-3" : "J-1"} pour ${client.name} — ${serviceWhen(quote)}`,
      text: `${intro}\n\nRelire, modifier et envoyer : ${link}\n\n----- Aperçu -----\n\n${message}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222">
        <p>${escapeHtml(intro)}</p>${button(link, "Relire et envoyer au client")}
        <p style="color:#777777;font-size:13px">Aperçu du message :</p>
        <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #dddddd;color:#444444">${escapeHtml(message).replace(/\n/g, "<br>")}</blockquote></div>`
    });
    prepared.push(`${quote.number}:${kind}`);
  }
  return { prepared };
}

// ---------------------------------------------------------------- page rappel.html (Alex)

async function findReminder(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(token)) throw new UserError("Ce lien n'est pas valide.", 404);
  const reminder = (await rows(`quote_reminders?select=*&token=eq.${encodeURIComponent(token)}&limit=1`))[0];
  if (!reminder) throw new UserError("Ce lien n'est pas valide.", 404);
  const quote = (await rows(`quotes?select=*&id=eq.${reminder.quote_id}`))[0];
  if (!quote) throw new UserError("Le devis de ce rappel n'existe plus.", 404);
  return { reminder, quote, client: await clientOf(quote) };
}

async function view(token: unknown) {
  const { reminder, quote, client } = await findReminder(token);
  const pay = await paymentButton(reminder.kind, quote);
  return {
    kind: reminder.kind,
    kindLabel: KIND_LABEL[reminder.kind],
    sentAt: reminder.sent_at,
    to: client.email,
    clientName: client.name,
    number: quote.number,
    when: where(quote),
    message: reminder.message,
    payButton: pay?.label ?? null
  };
}

async function send(body: Row) {
  const { reminder, quote, client } = await findReminder(body.token);
  if (reminder.sent_at) throw new UserError("Ce rappel a déjà été envoyé.", 409);
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 6000) : "";
  if (!message) throw new UserError("Le message est vide.");
  if (!client.email) throw new UserError("Le client n'a pas d'adresse e-mail.");
  // Marqué envoyé d'abord : un double clic n'envoie pas deux e-mails.
  const claimed = await rows(`quote_reminders?id=eq.${reminder.id}&sent_at=is.null&select=id`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ sent_at: new Date().toISOString(), message })
  });
  if (!claimed.length) throw new UserError("Ce rappel a déjà été envoyé.", 409);
  const pay = await paymentButton(reminder.kind, quote);
  try {
    await sendEmail({
      to: [client.email],
      reply_to: requiredEnv("CONTACT_EMAIL_TO"),
      subject: reminder.kind === "j3"
        ? `Rappel : votre rendez-vous du ${serviceWhen(quote)} — Alexandre Palanca`
        : `Votre rendez-vous approche — infos pratiques et règlement du solde — Alexandre Palanca`,
      text: message + (pay ? `\n\n${pay.label} : ${pay.url}` : ""),
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222">
        <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>${pay ? button(pay.url, pay.label) : ""}</div>`
    });
  } catch (error) {
    await databaseRequest(`quote_reminders?id=eq.${reminder.id}`, { method: "PATCH", body: JSON.stringify({ sent_at: null }) });
    throw error;
  }
  return { sent: true };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: allowedOrigins().has(request.headers.get("Origin") ?? "") ? 204 : 403, headers: cors(request) });
  }
  try {
    if (request.method !== "POST") throw new UserError("Méthode non autorisée.", 405);
    const body = await request.json().catch(() => ({})) as Row;
    if (body.action === "prepare") {
      // Appel planifié : secret du coffre (le même que le nettoyage nocturne)
      const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "");
      const valid = token && await databaseRequest("rpc/cleanup_secret_valid", {
        method: "POST", body: JSON.stringify({ p_secret: token })
      }).catch(() => false) === true;
      if (!valid) return reply(request, 401, { message: "Non autorisé." });
      const result = await prepare();
      console.log("Rappels préparés", JSON.stringify(result));
      return reply(request, 200, result);
    }
    if (!allowedOrigins().has(request.headers.get("Origin") ?? "")) throw new UserError("Origine non autorisée.", 403);
    if (body.action === "get") return reply(request, 200, await view(body.token));
    if (body.action === "send") return reply(request, 200, await send(body));
    throw new UserError("Requête invalide.");
  } catch (error) {
    if (error instanceof UserError) return reply(request, error.status, { message: error.message });
    console.error("Quote reminders error", error);
    return reply(request, 500, { message: "Une erreur est survenue. Réessayez dans un instant." });
  }
});
