import { databaseRequest } from "../_shared/http.ts";

// Nettoyage automatique, appelé chaque nuit par la base (pg_cron, voir la migration 202611080005).
// - Galeries fermées (ou expirées) depuis plus de RETENTION_DAYS jours : aperçus et originaux supprimés.
//   Sans commande, la galerie et ses photos sont supprimées entièrement. Avec des commandes, la fiche
//   de la galerie, les photos commandées et les commandes restent (traces de vente pour la comptabilité).
// - Devis refusés depuis plus de RETENTION_DAYS jours : supprimés avec leur PDF (lignes du devis en cascade).
// - Fiches clients créées par le formulaire du site, sans devis ni facture au bout de 6 mois : supprimées.
// - Demandes reçues par le formulaire (centre de notifications) : supprimées au bout de 6 mois.
// Appel protégé (secret rangé dans le coffre de la base, ou clé de service). Ajouter ?dry_run=1 pour voir ce qui serait supprimé, sans rien supprimer.

const RETENTION_DAYS = 61; // environ deux mois

type Gallery = { id: string; name: string; status: string; closed_at: string | null; expires_at: string };
type Photo = { id: string; preview_path: string; original_path: string };

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Réglage serveur manquant : ${name}`);
  return value;
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

// Suppression de fichiers dans un espace de stockage privé (par lots de 500).
async function removeFiles(bucket: string, paths: string[]) {
  const url = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  for (let i = 0; i < paths.length; i += 500) {
    const batch = paths.slice(i, i + 500);
    const response = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: batch })
    });
    if (!response.ok) throw new Error(`Suppression de fichiers refusée (${bucket}, HTTP ${response.status})`);
  }
}

const inList = (ids: string[]) => `(${ids.map(encodeURIComponent).join(",")})`;

Deno.serve(async (request) => {
  // Appel autorisé : la tâche planifiée (secret du coffre) ou la clé de service du projet (essais manuels).
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "");
  const isServiceKey = token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isScheduler = token && !isServiceKey && await databaseRequest("rpc/cleanup_secret_valid", {
    method: "POST",
    body: JSON.stringify({ p_secret: token })
  }).catch(() => false) === true;
  if (!isServiceKey && !isScheduler) return reply(401, { message: "Non autorisé." });
  // Mode essai tant que le réglage CLEANUP_ACTIVE ne vaut pas « true » : rien n'est supprimé,
  // la liste de ce qui le serait est écrite dans le journal de la fonction.
  const active = Deno.env.get("CLEANUP_ACTIVE") === "true";
  const dryRun = !active || new URL(request.url).searchParams.get("dry_run") === "1";
  const limit = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
  const previewBucket = Deno.env.get("GALLERY_PREVIEW_BUCKET") || "gallery-previews";
  const originalsBucket = Deno.env.get("GALLERY_ORIGINALS_BUCKET") || "gallery-originals";
  const report = { dryRun, limit: limit.toISOString(), galleries: [] as unknown[], quotes: [] as unknown[], errors: [] as string[] };

  // ---- Galeries ----
  const galleries = await databaseRequest("galleries?select=id,name,status,closed_at,expires_at") as Gallery[];
  const due = galleries.filter((gallery) => {
    // Date de fermeture : fermeture manuelle, sinon fin de validité.
    const closedOn = gallery.status === "closed" ? (gallery.closed_at ?? gallery.expires_at) : gallery.expires_at;
    return Date.parse(closedOn) < limit.getTime();
  });

  for (const gallery of due) {
    try {
      const photos = await databaseRequest(
        `gallery_photos?select=id,preview_path,original_path&gallery_id=eq.${encodeURIComponent(gallery.id)}`
      ) as Photo[];
      const orders = await databaseRequest(
        `gallery_orders?select=id&gallery_id=eq.${encodeURIComponent(gallery.id)}`
      ) as Array<{ id: string }>;
      const orderedIds = new Set<string>();
      if (orders.length && photos.length) {
        const ordered = await databaseRequest(
          `gallery_order_photos?select=photo_id&photo_id=in.${inList(photos.map((p) => p.id))}`
        ) as Array<{ photo_id: string }>;
        ordered.forEach((row) => orderedIds.add(row.photo_id));
      }
      const entry = {
        id: gallery.id,
        name: gallery.name,
        photos: photos.length,
        orders: orders.length,
        action: orders.length ? "photos supprimées, fiche et commandes conservées" : "galerie supprimée entièrement"
      };
      if (!photos.length && orders.length) continue; // déjà nettoyée lors d'un passage précédent
      report.galleries.push(entry);
      if (dryRun) continue;

      if (photos.length) {
        await removeFiles(previewBucket, photos.map((p) => p.preview_path));
        await removeFiles(originalsBucket, photos.map((p) => p.original_path));
        const unordered = photos.filter((p) => !orderedIds.has(p.id)).map((p) => p.id);
        if (unordered.length) {
          await databaseRequest(`gallery_photos?id=in.${inList(unordered)}`, { method: "DELETE" });
        }
      }
      if (!orders.length) {
        // Guide PDF des contenus réseaux (s'il y en a un)
        const docs = await databaseRequest(`galleries?select=tutorial_path&id=eq.${encodeURIComponent(gallery.id)}`) as Array<{ tutorial_path: string | null }>;
        if (docs[0]?.tutorial_path) await removeFiles("client-documents", [docs[0].tutorial_path]);
        await databaseRequest(`galleries?id=eq.${encodeURIComponent(gallery.id)}`, { method: "DELETE" });
      }
    } catch (error) {
      report.errors.push(`Galerie ${gallery.name} : ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ---- Devis refusés ----
  try {
    const quotes = await databaseRequest(
      `quotes?select=id,number,pdf_path,refused_at&status=eq.refused&refused_at=lt.${encodeURIComponent(limit.toISOString())}`
    ) as Array<{ id: string; number: string | null; pdf_path: string | null }>;
    let linked = new Set<string>();
    if (quotes.length) {
      const invoices = await databaseRequest(
        `invoices?select=quote_id&quote_id=in.${inList(quotes.map((q) => q.id))}`
      ) as Array<{ quote_id: string }>;
      linked = new Set(invoices.map((row) => row.quote_id));
    }
    for (const quote of quotes) {
      if (linked.has(quote.id)) continue; // un devis lié à une facture n'est jamais supprimé
      report.quotes.push({ id: quote.id, number: quote.number });
      if (dryRun) continue;
      try {
        if (quote.pdf_path) await removeFiles("commerce-documents", [quote.pdf_path]);
        await databaseRequest(`quotes?id=eq.${encodeURIComponent(quote.id)}`, { method: "DELETE" });
      } catch (error) {
        report.errors.push(`Devis ${quote.number ?? quote.id} : ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    report.errors.push(`Devis : ${error instanceof Error ? error.message : String(error)}`);
  }

  // ---- Fiches clients créées par le formulaire du site, jamais utilisées depuis 6 mois ----
  const clientsReport: unknown[] = [];
  try {
    const sixMonths = new Date(Date.now() - 183 * 24 * 3600 * 1000).toISOString();
    const candidates = await databaseRequest(
      `clients?select=id,name,email&source=eq.formulaire&created_at=lt.${encodeURIComponent(sixMonths)}`
    ) as Array<{ id: string; name: string; email: string }>;
    if (candidates.length) {
      const ids = inList(candidates.map((c) => c.id));
      const [usedQuotes, usedInvoices] = await Promise.all([
        databaseRequest(`quotes?select=client_id&client_id=in.${ids}`) as Promise<Array<{ client_id: string }>>,
        databaseRequest(`invoices?select=client_id&client_id=in.${ids}`) as Promise<Array<{ client_id: string }>>
      ]);
      const used = new Set([...usedQuotes, ...usedInvoices].map((row) => row.client_id));
      for (const client of candidates.filter((c) => !used.has(c.id))) {
        clientsReport.push({ name: client.name, email: client.email });
        if (dryRun) continue;
        try {
          await databaseRequest(`clients?id=eq.${encodeURIComponent(client.id)}`, { method: "DELETE" });
        } catch (error) {
          report.errors.push(`Fiche ${client.email} : ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  } catch (error) {
    report.errors.push(`Fiches clients : ${error instanceof Error ? error.message : String(error)}`);
  }
  (report as Record<string, unknown>).clients = clientsReport;

  // ---- Demandes du formulaire de plus de 6 mois (centre de notifications, planning) ----
  let requestsCount = 0;
  try {
    const sixMonths = new Date(Date.now() - 183 * 24 * 3600 * 1000).toISOString();
    const old = await databaseRequest(
      `contact_requests?select=id&created_at=lt.${encodeURIComponent(sixMonths)}`
    ) as Array<{ id: string }>;
    requestsCount = old.length;
    if (!dryRun && old.length) {
      await databaseRequest(`contact_requests?created_at=lt.${encodeURIComponent(sixMonths)}`, { method: "DELETE" });
    }
  } catch (error) {
    report.errors.push(`Demandes : ${error instanceof Error ? error.message : String(error)}`);
  }
  (report as Record<string, unknown>).requests = requestsCount;

  if (report.errors.length) console.error("Nettoyage automatique : erreurs", report.errors);
  console.log(
    `Nettoyage automatique${dryRun ? " (MODE ESSAI : rien n’a été supprimé)" : ""}`,
    JSON.stringify({ galeries: report.galleries, devis: report.quotes, fiches: clientsReport, demandes: requestsCount, erreurs: report.errors })
  );
  return reply(200, report);
});
