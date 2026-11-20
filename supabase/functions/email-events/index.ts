import { getSettings, issuerReplyTo, notifyDelivery, rows, type Row } from "../_shared/commerce-core.ts";

// Webhook Resend : quand un devis ou une facture envoyé(e) au client est délivré(e) dans sa boîte,
// ou n'a pas pu l'être (adresse inexistante, boîte pleine, refus…), le prestataire concerné
// (Alexandre ou Elisa, adresse de notification de sa fiche) reçoit un e-mail de suivi.
// Événements à cocher dans Resend : email.delivered, email.bounced, email.failed, email.delivery_delayed.

const encoder = new TextEncoder();

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

// Signature Svix (utilisée par Resend) : HMAC-SHA256 de « id.timestamp.corps », clé = secret whsec_ décodé.
async function isValidSignature(request: Request, body: string) {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET manquant.");
  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const header = request.headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !header || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${body}`)));
  return header.split(" ").some((part) => {
    const [version, signature] = part.split(",", 2);
    if (version !== "v1" || !signature) return false;
    try {
      return constantTimeEqual(expected, Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)));
    } catch {
      return false;
    }
  });
}

// Resend renvoie les tags sous forme d'objet { nom: valeur } (ou de liste selon les versions)
function tagsOf(data: Row): Record<string, string> {
  const tags = data?.tags;
  if (Array.isArray(tags)) return Object.fromEntries(tags.map((tag: Row) => [tag.name, String(tag.value)]));
  return tags && typeof tags === "object" ? tags : {};
}

const UUID = /^[0-9a-f-]{36}$/i;

async function documentOf(kind: string, id: string) {
  if (!UUID.test(id)) return null;
  const path = kind === "invoice"
    ? `invoices?select=id,number,issuer,kind,client_snapshot&id=eq.${id}`
    : `quotes?select=id,number,issuer,client_snapshot&id=eq.${id}`;
  return (await rows(path))[0] ?? null;
}

function reasonOf(type: string, data: Row) {
  if (type === "email.bounced") {
    const bounce = data.bounce ?? {};
    const kind = bounce.type === "Permanent"
      ? "adresse inexistante ou refusée définitivement"
      : bounce.type === "Transient" ? "refus temporaire (boîte pleine, serveur indisponible…)" : "";
    return [kind, bounce.message].filter(Boolean).join(" — ") || "le serveur du destinataire a refusé le message.";
  }
  if (type === "email.failed") return String(data.failed?.reason ?? "l'envoi a échoué.");
  if (type === "email.delivery_delayed") return "";
  return "";
}

async function handleEvent(event: Row) {
  const type = String(event.type ?? "");
  if (!["email.delivered", "email.bounced", "email.failed", "email.delivery_delayed"].includes(type)) return;
  const data = event.data ?? {};
  const tags = tagsOf(data);
  const kind = tags.doc_kind;
  if (!kind) return; // pas un devis / une facture (ex. notifications internes)
  const recipient = Array.isArray(data.to) ? data.to.join(", ") : String(data.to ?? "");
  const ok = type === "email.delivered";
  const delayed = type === "email.delivery_delayed";
  const reason = reasonOf(type, data);

  if (kind === "combined") {
    const [alex, elisa] = await Promise.all([documentOf("quote", tags.doc_id), documentOf("quote", tags.doc_id_2)]);
    if (!alex || !elisa) return;
    const [alexSettings, elisaSettings] = await Promise.all([getSettings("alexandre"), getSettings("elisa")]);
    await notifyDelivery({
      to: [issuerReplyTo(alexSettings), issuerReplyTo(elisaSettings)],
      ok, delayed, reason, recipient,
      label: `La proposition commune ${alex.number} + ${elisa.number}`,
      client: String(alex.client_snapshot?.name ?? "")
    });
    return;
  }

  const record = await documentOf(kind, tags.doc_id);
  if (!record) return;
  const settings = await getSettings(record.issuer);
  const label = kind === "quote"
    ? `Le devis ${record.number}`
    : `La facture${record.kind === "deposit" ? " d'acompte" : ""} ${record.number}`;
  await notifyDelivery({
    to: [issuerReplyTo(settings)],
    ok, delayed, reason, recipient, label,
    client: String(record.client_snapshot?.name ?? "")
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const body = await request.text();
    if (!await isValidSignature(request, body)) return new Response("Invalid signature", { status: 400 });
    await handleEvent(JSON.parse(body));
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Email event error", error);
    return new Response("Error", { status: 500 });
  }
});
