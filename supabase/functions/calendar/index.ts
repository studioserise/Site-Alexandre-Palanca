// Planning en abonnement pour le Calendrier de l'iPhone (et tout agenda compatible iCalendar).
// - GET ?t=<lien secret> : le planning au format .ics, lu régulièrement par l'agenda
//   (les agendas ne savent pas se connecter : le lien secret personnel tient lieu d'identifiant).
// - POST (administrateur connecté, depuis le site) : obtenir ou changer son lien.
import { assertBrowserOrigin, databaseRequest, jsonResponse, preflightResponse, readJson } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/admin.ts";
import * as center from "../_shared/admin-center.ts";
import { planningIcs } from "../_shared/ical.ts";

type Row = Record<string, any>;

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function feedUrl(token: string) {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/calendar?t=${token}`;
}

async function linkFor(userId: string, reset: boolean) {
  if (!reset) {
    const rows = await databaseRequest(`calendar_feeds?select=token&user_id=eq.${userId}`) as Row[];
    if (rows[0]) return rows[0].token as string;
  }
  const token = newToken();
  await databaseRequest("calendar_feeds?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, token, created_at: new Date().toISOString(), last_fetched_at: null })
  });
  return token;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function feed(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return new Response("Lien invalide.", { status: 404 });
  const rows = await databaseRequest(`calendar_feeds?select=user_id&token=eq.${token}`) as Row[];
  const userId = rows[0]?.user_id;
  if (!userId) return new Response("Lien invalide.", { status: 404 });
  // Le lien cesse de fonctionner si le compte n'est plus administrateur
  const admins = await databaseRequest(`gallery_admins?select=user_id&user_id=eq.${userId}&limit=1`) as Row[];
  if (!admins.length) return new Response("Lien invalide.", { status: 404 });

  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - 90);
  const to = new Date(now); to.setDate(to.getDate() + 400);
  const { entries } = await center.planning(iso(from), iso(to)) as { entries: Row[] };
  const site = (Deno.env.get("FRONTEND_ORIGIN") ?? "https://alexandrepalanca.fr").replace(/\/$/, "");
  const body = planningIcs(entries as any, { name: "Alex & Elisa — Planning", appUrl: `${site}/app/#planning` });
  databaseRequest(`calendar_feeds?user_id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ last_fetched_at: now.toISOString() }) }).catch(() => {});
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="planning-alex-elisa.ics"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex"
    }
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflightResponse(request) ?? new Response(null, { status: 403 });
  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const response = await feed(new URL(request.url).searchParams.get("t") ?? "");
      return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
    }
    assertBrowserOrigin(request);
    const admin = await requireAdmin(request);
    const body = await readJson(request);
    if (body.action !== "get-link" && body.action !== "reset-link") return jsonResponse(request, 400, { message: "Requête invalide." });
    const token = await linkFor(admin.id, body.action === "reset-link");
    const url = feedUrl(token);
    const rows = await databaseRequest(`calendar_feeds?select=last_fetched_at&user_id=eq.${admin.id}`) as Row[];
    return jsonResponse(request, 200, { url, webcal: url.replace(/^https:/, "webcal:"), lastFetchedAt: rows[0]?.last_fetched_at ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("Origine") || message.includes("Accès administrateur") ? 403
      : message.includes("Session administrateur") ? 401
      : message.includes("invalide") ? 400 : 500;
    if (status >= 500) console.error("Calendar function error", error);
    return jsonResponse(request, status, { message: status >= 500 ? "Une erreur est survenue." : message });
  }
});
