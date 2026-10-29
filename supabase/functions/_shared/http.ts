const encoder = new TextEncoder();

export function jsonResponse(request: Request, status: number, body: unknown) {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export function corsHeaders(request: Request) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  const allowedOrigin = Deno.env.get("FRONTEND_ORIGIN");
  const requestOrigin = request.headers.get("Origin");

  if (allowedOrigin && requestOrigin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Expose-Headers", "Content-Disposition");
  }
  return headers;
}

export function preflightResponse(request: Request) {
  if (request.method !== "OPTIONS") return null;
  const allowedOrigin = Deno.env.get("FRONTEND_ORIGIN");
  const requestOrigin = request.headers.get("Origin");
  if (!allowedOrigin || requestOrigin !== allowedOrigin) {
    return new Response(null, { status: 403 });
  }
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(null, { status: 204, headers });
}

export function assertBrowserOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = Deno.env.get("FRONTEND_ORIGIN");
  if (!origin || !allowedOrigin || origin !== allowedOrigin) {
    throw new Error("Origine non autorisée.");
  }
}

export async function readJson(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error();
    }
    return body as Record<string, unknown>;
  } catch {
    throw new Error("Requête JSON invalide.");
  }
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sessionKey() {
  const secret = Deno.env.get("GALLERY_SESSION_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error("La clé serveur des sessions de galerie n’est pas configurée.");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createGallerySession(galleryId: string) {
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({
    galleryId,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 8
  })));
  const key = await sessionKey();
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  ));
  return `${payload}.${encodeBase64Url(signature)}`;
}

export async function readGallerySession(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new Error("Accès à la galerie expiré.");

  const key = await sessionKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64Url(signature),
    encoder.encode(payload)
  );
  if (!valid) throw new Error("Accès à la galerie invalide.");

  let claims: { galleryId?: string; expiresAt?: number };
  try {
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
  } catch {
    throw new Error("Accès à la galerie invalide.");
  }
  if (
    typeof claims.galleryId !== "string" ||
    typeof claims.expiresAt !== "number" ||
    claims.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Accès à la galerie expiré.");
  }
  return claims.galleryId;
}

export async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function databaseRequest(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Le service de données n’est pas configuré.");
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const text = await response.text();
  let result: unknown = null;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }
  }
  if (!response.ok) {
    console.error("Supabase REST request failed", response.status, result);
    throw new Error("Le service de galerie n’a pas pu traiter la demande.");
  }
  return result;
}

export function errorResponse(request: Request, error: unknown) {
  const message = error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
  const status =
    message.includes("Origine") ? 403 :
    message.includes("Accès administrateur") || message.includes("Galerie non autorisée") ? 403 :
    message.includes("Session administrateur") ? 401 :
    message.includes("Accès à la galerie") ? 401 :
    message.includes("Requête") || message.includes("invalide") ? 400 :
    message.includes("fermée") ? 410 : 500;
  if (status === 500) console.error("Gallery function error", error);
  return jsonResponse(request, status, { message });
}

export function requireString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} invalide.`);
  }
  return value.trim();
}
