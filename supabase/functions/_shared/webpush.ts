// Web Push sans bibliothèque externe (WebCrypto) :
// - authentification VAPID (RFC 8292) : jeton JWT signé ES256 avec la clé privée du serveur ;
// - chiffrement du contenu « aes128gcm » (RFC 8291 / RFC 8188) avec les clés de l'abonnement.
// Compatible avec les services push d'Apple (iPhone, application installée), Google et Mozilla.
import { databaseRequest } from "./http.ts";

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromB64url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}

export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

// Paire de clés VAPID : créée une seule fois, gardée en base (table sans accès public)
export async function vapidKeys(): Promise<VapidKeys> {
  const rows = await databaseRequest("push_keys?select=public_key,private_jwk&id=eq.1") as Array<{ public_key: string; private_jwk: JsonWebKey }>;
  if (rows[0]) return { publicKey: rows[0].public_key, privateJwk: rows[0].private_jwk };
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  // Si deux appels simultanés créent une clé, la première enregistrée est conservée
  await databaseRequest("push_keys", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ id: 1, public_key: publicKey, private_jwk: privateJwk })
  });
  return await vapidKeys();
}

export async function vapidJwt(audience: string, subject: string, keys: VapidKeys, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", { ...keys.privateJwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(signature)}`;
}

// Chiffrement aes128gcm d'un message pour un abonnement (clé publique p256dh + secret auth du navigateur)
export async function encryptPayload(payload: Uint8Array, p256dh: string, authSecret: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const uaPublic = fromB64url(p256dh);
  const auth = fromB64url(authSecret);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const prkKey = await hmac(auth, ecdhSecret);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const aes = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = concat(payload, new Uint8Array([2])); // délimiteur du dernier (unique) bloc
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aes, plaintext as BufferSource));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

export type Subscription = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

export async function sendPush(sub: Subscription, message: PushMessage, keys: VapidKeys, options: { ttl?: number; urgency?: "high" | "normal" | "low" } = {}) {
  const endpoint = new URL(sub.endpoint);
  if (endpoint.protocol !== "https:") throw new Error("Adresse d'abonnement invalide.");
  const jwt = await vapidJwt(endpoint.origin, "mailto:info@alexandrepalanca.fr", keys);
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth);
  const response = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options.ttl ?? 6 * 3600),
      Urgency: options.urgency ?? "normal"
    },
    body: body as BodyInit
  });
  const text = response.ok ? "" : (await response.text().catch(() => "")).slice(0, 300);
  return { status: response.status, ok: response.ok, gone: response.status === 404 || response.status === 410, error: text };
}
