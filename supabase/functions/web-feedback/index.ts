import {
  assertBrowserOrigin,
  databaseRequest,
  errorResponse,
  jsonResponse,
  preflightResponse,
  readGallerySession,
  readJson
} from "../_shared/http.ts";
import { getSettings, issuerFrom, issuerReplyTo } from "../_shared/commerce-core.ts";

// Suivi de site web (espace client) : le client envoie ses retours page par page.
// Chaque page est soit validée (« ça me convient »), soit commentée ; un dernier commentaire
// général est possible. Chaque envoi compte comme une série de modifications prévue au contrat.
// Elisa reçoit tous les retours par e-mail.

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function escapeHtml(value: string) {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => map[char]);
}

Deno.serve(async (request) => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  try {
    assertBrowserOrigin(request);
    if (request.method !== "POST") return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    const galleryId = await readGallerySession(request);
    const body = await readJson(request) as Row;

    const gallery = (await databaseRequest(
      `galleries?select=id,name,status,expires_at,delivery,web_pages,feedback_rounds&id=eq.${encodeURIComponent(galleryId)}&limit=1`
    ) as Row[])[0];
    if (!gallery || gallery.delivery !== "web") return jsonResponse(request, 404, { message: "Suivi de site introuvable." });
    if (gallery.status !== "open" || Date.parse(gallery.expires_at) <= Date.now()) {
      return jsonResponse(request, 410, { message: "Cet accès est fermé." });
    }
    const done = await databaseRequest(`web_feedback?select=round&gallery_id=eq.${gallery.id}`) as Row[];
    if (done.length >= gallery.feedback_rounds) {
      return jsonResponse(request, 409, {
        message: "Les séries de modifications prévues au contrat ont toutes été utilisées. Contactez Elisa pour la suite."
      });
    }

    const pages = (gallery.web_pages ?? []) as Array<{ name: string; url: string }>;
    const input = Array.isArray(body.entries) ? body.entries : [];
    const entries = pages.map((page, index) => {
      const raw = input[index] ?? {};
      return {
        page: page.name,
        url: page.url,
        approved: raw.approved === true,
        comment: typeof raw.comment === "string" ? raw.comment.trim().slice(0, 4000) : ""
      };
    });
    const missing = entries.filter((entry) => !entry.approved && !entry.comment);
    if (missing.length) {
      return jsonResponse(request, 400, {
        message: `Pour chaque page, laissez un commentaire ou cochez « Ça me convient » (manquant : ${missing.map((m) => m.page).join(", ")}).`
      });
    }
    const finalComment = typeof body.finalComment === "string" ? body.finalComment.trim().slice(0, 4000) : "";
    const round = done.length + 1;

    await databaseRequest("web_feedback", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ gallery_id: gallery.id, round, entries, final_comment: finalComment })
    });

    // E-mail à Elisa avec tous les retours
    const settings = await getSettings("elisa");
    const lines = [
      `Retours du client sur le site « ${gallery.name} » — série ${round} sur ${gallery.feedback_rounds}.`,
      "",
      ...entries.flatMap((entry) => [
        `■ ${entry.page}${entry.approved ? " — ✓ ça me convient" : ""}`,
        ...(entry.comment ? [entry.comment] : []),
        ""
      ]),
      ...(finalComment ? ["Une dernière chose :", finalComment, ""] : []),
      `Séries restantes : ${gallery.feedback_rounds - round}.`
    ];
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222;max-width:640px">
      <p><strong>Retours du client sur le site « ${escapeHtml(gallery.name)} »</strong><br>Série ${round} sur ${gallery.feedback_rounds}</p>
      ${entries.map((entry) => `<h3 style="margin:20px 0 4px;font-size:15px">${escapeHtml(entry.page)}${entry.approved ? ' <span style="color:#2e7d32">✓ ça me convient</span>' : ""}</h3>
        ${entry.comment ? `<p style="margin:0;white-space:pre-wrap">${escapeHtml(entry.comment)}</p>` : ""}
        <p style="margin:2px 0 0;font-size:12px;color:#888888">${escapeHtml(entry.url)}</p>`).join("")}
      ${finalComment ? `<h3 style="margin:22px 0 4px;font-size:15px">Une dernière chose</h3><p style="margin:0;white-space:pre-wrap">${escapeHtml(finalComment)}</p>` : ""}
      <p style="margin-top:22px;color:#777777">Séries de modifications restantes : ${gallery.feedback_rounds - round}.</p></div>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY") ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: issuerFrom(settings),
        to: [issuerReplyTo(settings)],
        subject: `💬 Retours du client — ${gallery.name} (série ${round}/${gallery.feedback_rounds})`,
        text: lines.join("\n"),
        html
      })
    });
    if (!response.ok) console.error("Resend rejected the web feedback email", response.status);

    return jsonResponse(request, 200, { ok: true, round, roundsLeft: gallery.feedback_rounds - round });
  } catch (error) {
    return errorResponse(request, error);
  }
});
