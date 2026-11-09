// Centre de notifications et planning de l'espace administrateur (actions de commerce-api).
// Les notifications sont recalculées à chaque ouverture à partir des données : quand la tâche
// est faite (devis créé, facture émise, galerie publiée…), elles disparaissent d'elles-mêmes.
// Une notification écartée à la main est mémorisée (notification_dismissals) par sa clé.
import { databaseRequest } from "./http.ts";
import { formatMoney } from "./commerce-pdf.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export type Notification = {
  key: string;
  priority: number; // 0 à 100 : plus c'est haut, plus c'est urgent
  level: "urgent" | "important" | "normal" | "info";
  category: "galerie" | "demande" | "devis" | "facture" | "rappel";
  title: string;
  detail: string;
  deadline?: string; // échéance (compte à rebours)
  link?: string; // page à ouvrir
  contactRequestId?: string; // ouvre le détail du formulaire
  // Boutons directement dans la notification (ex. télécharger / envoyer la proposition commune)
  actions?: Array<{ label: string; action: "download-quote" | "send-quote"; quoteId: string; email?: string }>;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function rows(path: string) {
  return await databaseRequest(path) as Row[];
}

function todayParis() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
}
function addDays(isoDate: string, days: number) {
  const next = new Date(`${isoDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
function dateFr(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
}
function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso.slice(0, 10)}T12:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
}
// Heure de Paris → instant (heure par défaut : 9 h)
export function parisInstant(isoDate: string, time: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = (/^\d{2}:\d{2}$/.test(time || "") ? time : "09:00").split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
  const asParis = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return guess - (asParis - guess);
}

function level(priority: number): Notification["level"] {
  return priority >= 90 ? "urgent" : priority >= 70 ? "important" : priority >= 45 ? "normal" : "info";
}
const clientName = (quote: Row) => quote.client_snapshot?.name || "Client";
const quoteLink = (id: string) => `gestion-commerciale.html#devis=${id}`;

export async function notifications() {
  const today = todayParis();
  const now = Date.now();
  const site = (Deno.env.get("FRONTEND_ORIGIN") ?? "").replace(/\/$/, "");
  const [quotes, invoices, requests, reminders, galleries, orders, events, dismissed, feedback] = await Promise.all([
    rows("quotes?select=id,number,issuer,status,client_id,client_snapshot,valid_until,validated_at,created_at,service_date,service_time,deposit_enabled,deposit_cents,total_ttc_cents,response_redo,responded_at,deposit_transfer_notified_at,balance_transfer_notified_at,partner_requested,partner_quote_id,bundle,bundle_formula,combined_sent_at,pdf_path&order=created_at.desc&limit=1000"),
    rows("invoices?select=id,number,kind,status,quote_id,due_date,amount_due_cents,paid_cents,client_snapshot&status=neq.cancelled&limit=2000"),
    rows("contact_requests?select=*&status=eq.new&order=created_at.desc&limit=200"),
    rows("quote_reminders?select=quote_id,kind,token,prepared_at&sent_at=is.null&limit=200"),
    rows(`galleries?select=id,name,status,expires_at,created_at,view_count,download_count,quote_id,event_id,delivery&limit=500`),
    rows(`gallery_orders?select=id,gallery_id,total_cents,paid_at,status&status=in.(paid_to_prepare,sent)&paid_at=gte.${addDays(today, -30)}&limit=500`),
    rows(`planning_events?select=*&kind=eq.seance&event_date=gte.${addDays(today, -30)}&event_date=lte.${today}`),
    rows("notification_dismissals?select=key&limit=5000"),
    rows(`web_feedback?select=id,gallery_id,round,entries,final_comment,submitted_at&submitted_at=gte.${addDays(today, -45)}T00:00:00Z&order=submitted_at.desc&limit=100`)
  ]);
  const hidden = new Set(dismissed.map((entry) => entry.key));
  const list: Notification[] = [];
  const push = (n: Omit<Notification, "level">) => {
    if (!hidden.has(n.key)) list.push({ ...n, level: level(n.priority) });
  };
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const invoicesOf = (quoteId: string) => invoices.filter((invoice) => invoice.quote_id === quoteId && invoice.number);

  // 1. Galerie à publier dans les 72 h suivant une séance passée (priorité absolue)
  const linkedQuotes = new Set(galleries.map((g) => g.quote_id).filter(Boolean));
  const linkedEvents = new Set(galleries.map((g) => g.event_id).filter(Boolean));
  const sessions = [
    ...quotes
      .filter((q) => q.status === "accepted" && q.service_date && q.service_date >= addDays(today, -30) && q.service_date <= today && !linkedQuotes.has(q.id))
      .map((q) => ({ key: `galerie-a-publier:q:${q.id}`, date: q.service_date, time: q.service_time, who: clientName(q), link: quoteLink(q.id) })),
    ...events
      .filter((e) => !linkedEvents.has(e.id))
      .map((e) => ({ key: `galerie-a-publier:e:${e.id}`, date: e.event_date, time: e.event_time, who: e.title, link: "" }))
  ];
  for (const session of sessions) {
    const start = parisInstant(session.date, session.time);
    if (start > now) continue;
    const deadline = start + 72 * 3_600_000;
    push({
      key: session.key,
      priority: deadline < now ? 100 : 96,
      category: "galerie",
      title: `Publier la galerie — ${session.who}`,
      detail: `Séance du ${dateFr(session.date)}${session.time ? ` à ${session.time}` : ""}. Galerie à mettre en ligne sous 72 h (à lier à la séance lors de sa création).`,
      deadline: new Date(deadline).toISOString(),
      link: "admin-galeries.html"
    });
  }

  // 2. Rappels client préparés, en attente de validation
  for (const reminder of reminders) {
    const quote = quoteById.get(reminder.quote_id);
    if (!quote || quote.status !== "accepted" || !quote.service_date || quote.service_date < today) continue;
    push({
      key: `rappel:${reminder.token}`,
      priority: 90,
      category: "rappel",
      title: `Rappel ${reminder.kind === "j3" ? "J-3" : "J-1"} à valider — ${clientName(quote)}`,
      detail: `Rendez-vous le ${dateFr(quote.service_date)}${quote.service_time ? ` à ${quote.service_time}` : ""}. Relire et envoyer le rappel au client.`,
      deadline: new Date(parisInstant(quote.service_date, quote.service_time)).toISOString(),
      link: `${site}/rappel.html?t=${reminder.token}`
    });
  }

  // 3. Demandes du formulaire : créer un devis (disparaît dès qu'un devis est créé pour ce client)
  for (const request of requests) {
    const quoted = request.client_id && quotes.some((q) => q.client_id === request.client_id && q.created_at >= request.created_at);
    if (quoted) {
      await databaseRequest(`contact_requests?id=eq.${request.id}`, { method: "PATCH", body: JSON.stringify({ status: "quoted" }) }).catch(() => {});
      continue;
    }
    const soon = request.wanted_date && daysBetween(today, request.wanted_date) <= 14;
    push({
      key: `demande:${request.id}`,
      priority: soon ? 88 : 80,
      category: "demande",
      title: `Nouvelle demande — ${request.name || request.email || "sans nom"}`,
      detail: [request.service, request.type, request.wanted_date ? `pour le ${dateFr(request.wanted_date)}` : request.date_text]
        .filter(Boolean).join(" · ") + ". Créer un devis à partir du formulaire.",
      contactRequestId: request.id
    });
  }

  // Proposition commune (devis d'Alexandre + devis d'Elisa) : à compléter, puis à envoyer au client
  for (const second of quotes.filter((q) => q.partner_quote_id)) {
    const first = quoteById.get(second.partner_quote_id);
    if (!first) continue;
    const alex = first.issuer === "elisa" ? second : first;
    const elisa = first.issuer === "elisa" ? first : second;
    if ([alex.status, elisa.status].some((status) => status === "refused" || status === "accepted")) continue;
    const who = clientName(alex);
    if (alex.number && elisa.number) {
      if (alex.combined_sent_at) continue;
      push({
        key: `proposition-a-envoyer:${alex.id}:${elisa.id}`, priority: 77, category: "devis",
        title: `Proposition commune prête — ${who}`,
        detail: `Les devis ${alex.number} (Alex) et ${elisa.number} (Elisa) sont validés : le PDF de 3 pages est prêt mais n'a pas encore été envoyé au client.`,
        link: quoteLink(alex.id),
        actions: [
          { label: "Télécharger", action: "download-quote", quoteId: alex.id },
          { label: "Envoyer au client", action: "send-quote", quoteId: alex.id, email: alex.client_snapshot?.email ?? "" }
        ]
      });
    } else if (alex.number || elisa.number) {
      const missing = alex.number ? elisa : alex;
      push({
        key: `proposition-incomplete:${missing.id}`, priority: 72, category: "devis",
        title: `Proposition commune à compléter — ${who}`,
        detail: `Le devis ${(alex.number ? alex : elisa).number} est validé. Validez le devis ${missing.issuer === "elisa" ? "d'Elisa" : "d'Alexandre"} pour générer le PDF commun de 3 pages.`,
        link: `gestion-commerciale.html#brouillon=${missing.id}`
      });
    }
  }

  // Devis de l'autre prestataire à créer (case cochée sur un devis) : s'éteint dès qu'il existe
  const partnered = new Set(quotes.map((q) => q.partner_quote_id).filter(Boolean));
  for (const quote of quotes.filter((q) => q.partner_requested && q.status !== "refused" && !partnered.has(q.id))) {
    const forAlex = quote.issuer === "elisa";
    const social = quote.bundle === "reseaux";
    const what = social
      ? (forAlex ? "le shooting photo & vidéo" : "la création digitale")
      : (forAlex ? "une prestation photo & vidéo" : "un site internet");
    push({
      key: `associe:${quote.id}`, priority: 74, category: "devis",
      title: social
        ? `Créer le devis ${forAlex ? "shooting photo & vidéo (Alex, 70 %)" : "création digitale (Elisa, 30 %)"} — contenus réseaux — ${clientName(quote)}`
        : forAlex ? `Créer le devis photo & vidéo (Alex) — ${clientName(quote)}` : `Créer le devis site internet (Elisa) — ${clientName(quote)}`,
      detail: `${forAlex ? "Le devis d'Elisa" : "Le devis d'Alexandre"}${quote.number ? ` ${quote.number}` : " (brouillon)"}${social ? ` (contenus réseaux${quote.bundle_formula ? ` · ${quote.bundle_formula}` : ""})` : ""} prévoit aussi ${what}. Le devis est déjà pré-rempli avec le client, le projet${social ? " et sa part du prix" : ""}.`,
      link: `gestion-commerciale.html#associe=${quote.id}`
    });
  }

  for (const quote of quotes.filter((q) => q.number)) {
    const linked = invoicesOf(quote.id);
    const deposit = linked.find((invoice) => invoice.kind === "deposit");
    const final = linked.find((invoice) => invoice.kind === "invoice");
    const who = clientName(quote);

    // 4. Refus avec demande d'un nouveau devis
    if (quote.status === "refused" && quote.response_redo) {
      const redone = quotes.some((q) => q.client_id === quote.client_id && q.id !== quote.id && q.created_at > (quote.responded_at ?? quote.created_at));
      if (!redone) {
        push({
          key: `refaire:${quote.id}`, priority: 78, category: "devis",
          title: `Refaire un devis — ${who}`,
          detail: `Le devis ${quote.number} a été refusé avec une demande de nouveau devis (voir son commentaire).`,
          link: quoteLink(quote.id)
        });
      }
    }

    if (quote.status === "accepted") {
      // 5. Facture d'acompte à émettre
      if (quote.deposit_enabled && quote.deposit_cents > 0 && !deposit) {
        push({
          key: `acompte-a-emettre:${quote.id}`, priority: 75, category: "facture",
          title: `Facture d'acompte à émettre — ${who}`,
          detail: `Devis ${quote.number} accepté : acompte de ${formatMoney(quote.deposit_cents)} à facturer.`,
          link: quoteLink(quote.id)
        });
      }
      // 6. Virements signalés par le client, à vérifier
      if (quote.deposit_transfer_notified_at && deposit && deposit.status !== "paid") {
        push({
          key: `virement-acompte:${quote.id}:${quote.deposit_transfer_notified_at}`, priority: 76, category: "facture",
          title: `Virement d'acompte signalé — ${who}`,
          detail: `${formatMoney(deposit.amount_due_cents - deposit.paid_cents)} (facture ${deposit.number}). À vérifier sur le compte, puis enregistrer le règlement.`,
          link: `gestion-commerciale.html#facture=${deposit.id}`
        });
      }
      if (quote.balance_transfer_notified_at && (!final || final.status !== "paid")) {
        push({
          key: `virement-solde:${quote.id}:${quote.balance_transfer_notified_at}`, priority: 76, category: "facture",
          title: `Virement du solde signalé — ${who}`,
          detail: `Devis ${quote.number}. À vérifier sur le compte, puis enregistrer le règlement${final ? "" : " (facture finale à créer)"}.`,
          link: final ? `gestion-commerciale.html#facture=${final.id}` : quoteLink(quote.id)
        });
      }
      // 7. Facture finale à émettre après la prestation
      if (!final && quote.service_date && quote.service_date <= today) {
        push({
          key: `finale-a-emettre:${quote.id}`, priority: 65, category: "facture",
          title: `Facture finale à émettre — ${who}`,
          detail: `Prestation du ${dateFr(quote.service_date)} réalisée : facture du solde à créer depuis le devis ${quote.number}.`,
          link: quoteLink(quote.id)
        });
      }
    }

    // 8. Devis envoyés : expiration proche, relance, expiré
    if (quote.status === "sent" && quote.valid_until) {
      const left = daysBetween(today, quote.valid_until);
      const age = quote.validated_at ? daysBetween(quote.validated_at, today) : 0;
      if (left < 0) {
        push({
          key: `expire:${quote.id}`, priority: 35, category: "devis",
          title: `Devis expiré — ${who}`,
          detail: `Le devis ${quote.number} a expiré le ${dateFr(quote.valid_until)} sans réponse. Relancer, refaire un devis ou classer.`,
          link: quoteLink(quote.id)
        });
      } else if (left <= 3) {
        push({
          key: `expire-bientot:${quote.id}`, priority: 60, category: "devis",
          title: `Devis bientôt expiré — ${who}`,
          detail: `Le devis ${quote.number} expire ${left === 0 ? "aujourd'hui" : `dans ${left} jour${left > 1 ? "s" : ""}`} sans réponse : relancer le client.`,
          deadline: new Date(parisInstant(quote.valid_until, "23:59")).toISOString(),
          link: quoteLink(quote.id)
        });
      } else if (age >= 7) {
        push({
          key: `relance:${quote.id}`, priority: 50, category: "devis",
          title: `Relancer — ${who}`,
          detail: `Le devis ${quote.number} a été envoyé il y a ${age} jours, toujours sans réponse.`,
          link: quoteLink(quote.id)
        });
      }
    }
  }

  // 9. Factures en retard de paiement
  for (const invoice of invoices) {
    if (!invoice.number || !["issued", "partially_paid"].includes(invoice.status) || !invoice.due_date || invoice.due_date >= today) continue;
    push({
      key: `retard:${invoice.id}`, priority: 70, category: "facture",
      title: `Facture en retard — ${invoice.client_snapshot?.name ?? ""}`,
      detail: `${invoice.number} : ${formatMoney(invoice.amount_due_cents - invoice.paid_cents)} à régler depuis le ${dateFr(invoice.due_date)}.`,
      link: `gestion-commerciale.html#facture=${invoice.id}`
    });
  }

  // 10. Galeries : ventes, fermeture proche, statistiques
  const galleryById = new Map(galleries.map((g) => [g.id, g]));

  // Retours d'un client sur son site (suivi de site web) : à traiter puis supprimer à la main
  for (const entry of feedback) {
    const gallery = galleryById.get(entry.gallery_id);
    const pages = (entry.entries ?? []) as Array<{ approved: boolean }>;
    const toChange = pages.filter((page) => !page.approved).length;
    push({
      key: `retours-site:${entry.id}`, priority: 82, category: "demande",
      title: `Retours du client sur le site — ${gallery?.name ?? "site"} (série ${entry.round})`,
      detail: toChange
        ? `${toChange} page${toChange > 1 ? "s" : ""} à modifier sur ${pages.length}${entry.final_comment ? ", plus un dernier commentaire" : ""}. Détail dans l'e-mail reçu et dans la gestion des galeries.`
        : `Toutes les pages conviennent au client${entry.final_comment ? " (avec un dernier commentaire)" : ""}.`,
      link: "admin-galeries.html"
    });
  }
  const photoCounts = new Map<string, number>();
  if (orders.length) {
    const lines = await rows(`gallery_order_photos?select=order_id&order_id=in.(${orders.map((o) => o.id).join(",")})`);
    for (const line of lines) photoCounts.set(line.order_id, (photoCounts.get(line.order_id) ?? 0) + 1);
  }
  for (const order of orders) {
    const gallery = galleryById.get(order.gallery_id);
    const count = photoCounts.get(order.id) ?? 0;
    push({
      key: `vente:${order.id}`, priority: order.status === "paid_to_prepare" ? 55 : 45, category: "galerie",
      title: `Vente : ${count} photo${count > 1 ? "s" : ""} (${formatMoney(order.total_cents)}) — ${gallery?.name ?? "galerie"}`,
      detail: `Payée le ${dateFr(order.paid_at)}.${order.status === "paid_to_prepare" ? " Commande à préparer." : ""}`,
      link: "admin-galeries.html"
    });
  }
  const salesByGallery = new Map<string, { count: number; cents: number }>();
  for (const order of orders) {
    const current = salesByGallery.get(order.gallery_id) ?? { count: 0, cents: 0 };
    salesByGallery.set(order.gallery_id, { count: current.count + (photoCounts.get(order.id) ?? 0), cents: current.cents + order.total_cents });
  }
  for (const gallery of galleries.filter((g) => g.status === "open")) {
    const hoursLeft = (Date.parse(gallery.expires_at) - now) / 3_600_000;
    if (hoursLeft > 0 && hoursLeft <= 48) {
      push({
        key: `galerie-ferme:${gallery.id}`, priority: 40, category: "galerie",
        title: `La galerie ferme bientôt — ${gallery.name}`,
        detail: `Fermeture le ${dateFr(gallery.expires_at)}. Prolonger si besoin (nouveau code) ou laisser fermer.`,
        deadline: gallery.expires_at,
        link: "admin-galeries.html"
      });
    }
    const sales = salesByGallery.get(gallery.id) ?? { count: 0, cents: 0 };
    push({
      key: `stats:${gallery.id}:${gallery.view_count}:${gallery.download_count}:${sales.count}`, priority: 20, category: "galerie",
      title: `Galerie ${gallery.name}`,
      detail: gallery.delivery === "web"
        ? `Suivi de site : ${gallery.view_count} ouverture${gallery.view_count > 1 ? "s" : ""} par le client.`
        : gallery.delivery === "social"
        ? `Contenus réseaux : ${gallery.view_count} ouverture${gallery.view_count > 1 ? "s" : ""} · ${gallery.download_count} téléchargement${gallery.download_count > 1 ? "s" : ""} de dossiers.`
        : gallery.delivery === "video"
        ? `Livraison vidéo : ${gallery.view_count} ouverture${gallery.view_count > 1 ? "s" : ""} · ${gallery.download_count} clic${gallery.download_count > 1 ? "s" : ""} sur « Télécharger ».`
        : `${gallery.view_count} ouverture${gallery.view_count > 1 ? "s" : ""} · ${gallery.download_count} photo${gallery.download_count > 1 ? "s" : ""} téléchargée${gallery.download_count > 1 ? "s" : ""} · ${sales.count} vendue${sales.count > 1 ? "s" : ""} sur 30 jours${sales.cents ? ` (${formatMoney(sales.cents)})` : ""}.`,
      link: "admin-galeries.html"
    });
  }

  list.sort((a, b) =>
    b.priority - a.priority ||
    (a.deadline && b.deadline ? Date.parse(a.deadline) - Date.parse(b.deadline) : a.deadline ? -1 : b.deadline ? 1 : 0)
  );
  return { notifications: list, now: new Date().toISOString() };
}

export async function dismissNotification(key: unknown) {
  if (typeof key !== "string" || !key || key.length > 300) throw new Error("Notification invalide.");
  await databaseRequest("notification_dismissals", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: JSON.stringify({ key })
  });
  return { dismissed: true };
}

// ---------------------------------------------------------------- planning

export type PlanningEntry = {
  date: string;
  time: string;
  title: string;
  location: string;
  status: "confirmed" | "pending" | "other";
  source: "devis" | "demande" | "manuel";
  id: string;
  link?: string;
  note?: string;
  kind?: string;
};

export async function planning(from: unknown, to: unknown) {
  if (typeof from !== "string" || typeof to !== "string" || !DATE.test(from) || !DATE.test(to)) {
    throw new Error("Période invalide.");
  }
  const range = `gte.${from}&service_date=lte.${to}`;
  const [quotes, requests, events] = await Promise.all([
    rows(`quotes?select=id,number,status,client_snapshot,service_date,service_time,service_location,valid_until&service_date=${range}&status=in.(draft,sent,accepted)`),
    rows(`contact_requests?select=id,name,email,service,type,wanted_date&status=eq.new&wanted_date=gte.${from}&wanted_date=lte.${to}`),
    rows(`planning_events?select=*&event_date=gte.${from}&event_date=lte.${to}&order=event_date.asc`)
  ]);
  const today = todayParis();
  const entries: PlanningEntry[] = [];
  for (const quote of quotes) {
    if (quote.status === "sent" && quote.valid_until && quote.valid_until < today) continue;
    entries.push({
      date: quote.service_date, time: quote.service_time ?? "", location: quote.service_location ?? "",
      title: `${clientName(quote)}${quote.status === "accepted" ? "" : quote.number ? " (devis envoyé)" : " (devis en préparation)"}`,
      status: quote.status === "accepted" ? "confirmed" : "pending",
      source: "devis", id: quote.id, link: quote.number ? quoteLink(quote.id) : `gestion-commerciale.html#brouillon=${quote.id}`
    });
  }
  for (const request of requests) {
    entries.push({
      date: request.wanted_date, time: "", location: "",
      title: `${request.name || request.email || "Demande"} (demande)`,
      status: "pending", source: "demande", id: request.id,
      note: [request.service, request.type].filter(Boolean).join(" · ")
    });
  }
  for (const event of events) {
    entries.push({
      date: event.event_date, time: event.event_time, location: event.location, title: event.title,
      status: event.kind === "seance" ? "confirmed" : event.kind === "option" ? "pending" : "other",
      source: "manuel", id: event.id, note: event.note, kind: event.kind
    });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return { entries };
}

function text(value: unknown, label: string, max: number, required = false) {
  const value2 = typeof value === "string" ? value.trim() : "";
  if (required && !value2) throw new Error(`${label} : champ obligatoire.`);
  if (value2.length > max) throw new Error(`${label} : ${max} caractères maximum.`);
  return value2;
}

export async function saveEvent(input: Row) {
  const data = {
    event_date: DATE.test(String(input?.date)) ? input.date : (() => { throw new Error("Date invalide."); })(),
    event_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input?.time ?? "")) ? input.time : "",
    title: text(input?.title, "Titre", 200, true),
    location: text(input?.location, "Lieu", 300),
    kind: ["seance", "option", "autre"].includes(input?.kind) ? input.kind : "seance",
    note: text(input?.note, "Note", 2000),
    updated_at: new Date().toISOString()
  };
  if (input?.id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(input.id))) throw new Error("Date invalide.");
    const updated = await databaseRequest(`planning_events?id=eq.${input.id}&select=*`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(data)
    }) as Row[];
    return { event: updated[0] };
  }
  const created = await databaseRequest("planning_events?select=*", {
    method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(data)
  }) as Row[];
  return { event: created[0] };
}

export async function deleteEvent(id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Date invalide.");
  await databaseRequest(`planning_events?id=eq.${id}`, { method: "DELETE" });
  return { deleted: true };
}

// ---------------------------------------------------------------- demandes du formulaire

export async function contactRequest(id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Demande invalide.");
  const request = (await rows(`contact_requests?select=*&id=eq.${id}`))[0];
  if (!request) throw new Error("Demande introuvable.");
  const client = request.client_id ? (await rows(`clients?select=*&id=eq.${request.client_id}`))[0] ?? null : null;
  return { request, client };
}

export async function dismissContactRequest(id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Demande invalide.");
  await databaseRequest(`contact_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "dismissed" }) });
  return { dismissed: true };
}

// Séances proposées à la création d'une galerie (pour la lier et éteindre le rappel « publier »).
export async function listSessions() {
  const today = todayParis();
  const [quotes, events] = await Promise.all([
    rows(`quotes?select=id,number,client_snapshot,service_date&status=eq.accepted&service_date=gte.${addDays(today, -60)}&service_date=lte.${addDays(today, 30)}&order=service_date.desc`),
    rows(`planning_events?select=id,title,event_date&kind=eq.seance&event_date=gte.${addDays(today, -60)}&event_date=lte.${addDays(today, 30)}&order=event_date.desc`)
  ]);
  return {
    sessions: [
      ...quotes.map((q) => ({ value: `quote:${q.id}`, date: q.service_date, label: `${clientName(q)} — ${q.number}` })),
      ...events.map((e) => ({ value: `event:${e.id}`, date: e.event_date, label: e.title }))
    ].sort((a, b) => b.date.localeCompare(a.date))
  };
}
