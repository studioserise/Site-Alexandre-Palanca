import {
  assertBrowserOrigin,
  databaseRequest,
  jsonResponse,
  preflightResponse,
  readJson
} from "../_shared/http.ts";
import { requireAdmin } from "../_shared/admin.ts";
import {
  computeTotals,
  depositCents,
  normalizeFileSegment
} from "../_shared/commerce-calc.ts";
import {
  formatMoney,
  formatRate,
  PdfDocumentData,
  renderDocumentPdf
} from "../_shared/commerce-pdf.ts";

class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const BUCKET = "commerce-documents";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOGO_URL = "https://alexandrepalanca.fr/images/logo-document.png";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new UserError(`Le réglage serveur ${name} est manquant.`, 500);
  return value;
}

function str(value: unknown, label: string, max: number, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new UserError(`${label} : champ obligatoire.`);
  if (text.length > max) throw new UserError(`${label} : ${max} caractères maximum.`);
  return text;
}

function uuid(value: unknown, label: string) {
  if (typeof value !== "string" || !UUID.test(value)) throw new UserError(`${label} invalide.`);
  return value;
}

function date(value: unknown, label: string, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new UserError(`${label} : champ obligatoire.`);
    return null;
  }
  if (typeof value !== "string" || !DATE.test(value)) throw new UserError(`${label} invalide.`);
  return value;
}

function integer(value: unknown, label: string, min: number, max: number) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new UserError(`${label} invalide.`);
  }
  return number;
}

function todayParis() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
}

function addDays(isoDate: string, days: number) {
  const next = new Date(`${isoDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function eq(value: string) {
  return `eq.${encodeURIComponent(value)}`;
}

async function rows(path: string, init: RequestInit = {}) {
  return await databaseRequest(path, init) as Row[];
}

async function insertOne(table: string, body: Row) {
  const created = await rows(`${table}?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body)
  });
  return created[0];
}

async function patchOne(table: string, id: string, body: Row) {
  const updated = await rows(`${table}?id=${eq(id)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() })
  });
  if (!updated[0]) throw new UserError("Élément introuvable.", 404);
  return updated[0];
}

async function getSettings() {
  return (await rows("commerce_settings?select=*&id=eq.1"))[0];
}

// ---------------------------------------------------------------- clients

type ClientInput = {
  type: "particulier" | "professionnel";
  name: string;
  email: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  siret: string;
  vat_number: string;
};

function parseClient(input: Row): ClientInput {
  const type = input?.type === "professionnel" ? "professionnel" : "particulier";
  const email = str(input?.email, "Adresse e-mail", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new UserError("Adresse e-mail invalide.");
  }
  const siret = str(input?.siret, "SIREN/SIRET", 20).replace(/\s/g, "");
  if (siret && !/^\d{9}(\d{5})?$/.test(siret)) {
    throw new UserError("SIREN/SIRET invalide : 9 ou 14 chiffres attendus.");
  }
  return {
    type,
    name: str(input?.name, type === "professionnel" ? "Raison sociale" : "Nom et prénom", 200, true),
    email,
    phone: str(input?.phone, "Téléphone", 40),
    address: str(input?.address, "Adresse", 300),
    postal_code: str(input?.postalCode, "Code postal", 20),
    city: str(input?.city, "Ville", 120),
    country: str(input?.country, "Pays", 80) || "France",
    siret,
    vat_number: str(input?.vatNumber, "Numéro de TVA", 30).toUpperCase()
  };
}

// Contrôles exigés au moment de l'émission d'un document.
function assertClientComplete(client: Row) {
  if (!client.email) throw new UserError("Adresse e-mail du client invalide : à renseigner avant validation.");
  if (client.type === "professionnel") {
    if (!client.address || !client.postal_code || !client.city) {
      throw new UserError("Adresse complète du client invalide : obligatoire pour un professionnel.");
    }
    if (!/^\d{14}$/.test(client.siret || "")) {
      throw new UserError("SIRET du client invalide : 14 chiffres obligatoires pour un professionnel.");
    }
  }
}

function clientSnapshot(client: Row) {
  return {
    id: client.id,
    type: client.type,
    name: client.name,
    email: client.email,
    phone: client.phone,
    address: client.address,
    postal_code: client.postal_code,
    city: client.city,
    country: client.country,
    siret: client.siret,
    vat_number: client.vat_number
  };
}

async function upsertClient(input: Row) {
  const data = parseClient(input);
  if (input.id) {
    const id = uuid(input.id, "Client");
    return await patchOne("clients", id, data);
  }
  if (data.email) {
    const duplicate = await rows(
      `clients?select=id,name&email=ilike.${encodeURIComponent(data.email)}&limit=1`
    );
    if (duplicate.length) {
      throw new UserError(
        `Requête invalide : un client avec cet e-mail existe déjà (${duplicate[0].name}). Sélectionnez-le dans la recherche.`,
        409
      );
    }
  }
  return await insertOne("clients", data);
}

// ---------------------------------------------------------------- lignes

type ItemInput = {
  service_id: string | null;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_bps: number;
  saveToCatalog: boolean;
};

function parseItems(input: unknown): ItemInput[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 60) {
    throw new UserError("Prestations invalides : 1 à 60 lignes attendues.");
  }
  return input.map((raw: Row, index) => {
    const quantity = Number(raw?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
      throw new UserError(`Ligne ${index + 1} : quantité invalide.`);
    }
    return {
      service_id: raw?.serviceId ? uuid(raw.serviceId, "Prestation") : null,
      title: str(raw?.title, `Ligne ${index + 1} : intitulé`, 300, true),
      description: str(raw?.description, `Ligne ${index + 1} : description`, 1000),
      quantity: Math.round(quantity * 1000) / 1000,
      unit: str(raw?.unit, `Ligne ${index + 1} : unité`, 30) || "unité",
      unit_price_cents: integer(raw?.unitPriceCents, `Ligne ${index + 1} : prix`, 0, 100_000_000),
      vat_rate_bps: integer(raw?.vatRateBps, `Ligne ${index + 1} : taux de TVA`, 0, 10000),
      saveToCatalog: raw?.saveToCatalog === true
    };
  });
}

async function saveCatalogItems(items: ItemInput[]) {
  for (const item of items.filter((entry) => entry.saveToCatalog && !entry.service_id)) {
    await insertOne("services", {
      name: item.title,
      description: item.description,
      unit_price_cents: item.unit_price_cents,
      unit: item.unit,
      vat_rate_bps: item.vat_rate_bps
    });
  }
}

function itemRows(
  parentKey: string,
  parentId: string,
  items: ItemInput[],
  lineTotals: number[],
  withService: boolean
) {
  return items.map((item, position) => ({
    [parentKey]: parentId,
    position,
    ...(withService ? { service_id: item.service_id } : {}),
    title: item.title,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price_cents: item.unit_price_cents,
    vat_rate_bps: item.vat_rate_bps,
    total_ht_cents: lineTotals[position]
  }));
}

function totalsOf(items: ItemInput[]) {
  return computeTotals(items.map((item) => ({
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
    vatRateBps: item.vat_rate_bps
  })));
}

// ---------------------------------------------------------------- devis

async function loadQuote(id: string) {
  const quote = (await rows(`quotes?select=*&id=${eq(id)}`))[0];
  if (!quote) throw new UserError("Devis introuvable.", 404);
  const items = await rows(`quote_items?select=*&quote_id=${eq(id)}&order=position.asc`);
  return { ...quote, items };
}

function displayQuoteStatus(quote: Row) {
  if (quote.status === "sent" && quote.valid_until && quote.valid_until < todayParis()) {
    return "expired";
  }
  return quote.status;
}

async function saveQuote(body: Row) {
  const settings = await getSettings();
  const client = await upsertClient(body.client ?? {});
  const items = parseItems(body.items);
  const depositEnabled = body.depositEnabled !== false;
  const depositBps = integer(body.depositBps ?? settings.default_deposit_bps, "Pourcentage d'acompte", 0, 10000);
  const totals = totalsOf(items);
  const deposit = depositCents(totals.totalTtcCents, depositEnabled, depositBps);

  const fields = {
    client_id: client.id,
    client_snapshot: clientSnapshot(client),
    valid_until: date(body.validUntil, "Date de validité"),
    service_period: str(body.servicePeriod, "Période de réalisation", 300),
    project_description: str(body.projectDescription, "Description du projet", 4000),
    special_conditions: str(body.specialConditions, "Conditions particulières", 4000),
    payment_terms: str(body.paymentTerms, "Modalités de paiement", 4000),
    cancellation_terms: str(body.cancellationTerms, "Conditions d'annulation", 4000),
    delivery_terms: str(body.deliveryTerms, "Conditions de livraison", 4000),
    usage_terms: str(body.usageTerms, "Conditions d'utilisation", 4000),
    deposit_enabled: depositEnabled,
    deposit_bps: depositBps,
    total_ht_cents: totals.totalHtCents,
    total_vat_cents: totals.totalVatCents,
    total_ttc_cents: totals.totalTtcCents,
    deposit_cents: deposit,
    balance_cents: totals.totalTtcCents - deposit,
    vat_breakdown: totals.vatBreakdown
  };

  let quote: Row;
  if (body.quoteId) {
    const id = uuid(body.quoteId, "Devis");
    const existing = (await rows(`quotes?select=status,number&id=${eq(id)}`))[0];
    if (!existing) throw new UserError("Devis introuvable.", 404);
    if (existing.number) {
      throw new UserError("Requête invalide : un devis validé ne peut plus être modifié.", 409);
    }
    quote = await patchOne("quotes", id, fields);
    await databaseRequest(`quote_items?quote_id=${eq(id)}`, { method: "DELETE" });
  } else {
    quote = await insertOne("quotes", { ...fields, issue_date: todayParis() });
  }
  await saveCatalogItems(items);
  await databaseRequest("quote_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(itemRows("quote_id", quote.id, items, totals.lineTotals, true))
  });
  return await loadQuote(quote.id);
}

// ---------------------------------------------------------------- PDF

function partyLines(client: Row) {
  return [
    client.address,
    [client.postal_code, client.city].filter(Boolean).join(" "),
    client.country && client.country !== "France" ? client.country : "",
    client.siret ? `SIREN/SIRET : ${client.siret}` : "",
    client.vat_number ? `TVA : ${client.vat_number}` : "",
    client.email,
    client.phone
  ].filter(Boolean);
}

function issuerParty(settings: Row) {
  return {
    name: settings.trade_name || settings.legal_name,
    lines: [
      settings.address,
      [settings.postal_code, settings.city].filter(Boolean).join(" "),
      settings.siren ? `SIREN : ${settings.siren}` : "",
      settings.email,
      settings.phone
    ].filter(Boolean)
  };
}

function footerText(settings: Row) {
  return [
    settings.legal_name,
    settings.siren ? `SIREN ${settings.siren}` : "",
    settings.iban ? `IBAN : ${settings.iban}` : "",
    settings.vat_mention,
    settings.legal_footer
  ].filter(Boolean).join(" — ");
}

async function loadLogo() {
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function pdfItems(items: Row[]) {
  return items.map((item) => ({
    title: item.title,
    description: item.description,
    quantity: Number(item.quantity),
    unit: item.unit,
    unitPriceCents: item.unit_price_cents,
    vatRateBps: item.vat_rate_bps,
    totalHtCents: item.total_ht_cents
  }));
}

function vatRows(breakdown: Row[]) {
  return breakdown.map((row) => ({
    rateBps: row.rateBps,
    baseCents: row.baseCents,
    vatCents: row.vatCents
  }));
}

async function quotePdf(quote: Row, settings: Row) {
  const extra: PdfDocumentData["extraTotals"] = [];
  if (quote.deposit_enabled && quote.deposit_cents > 0) {
    extra.push({
      label: `Acompte demandé (${formatRate(quote.deposit_bps)} du TTC)`,
      cents: quote.deposit_cents
    });
    extra.push({ label: "Solde restant à payer", cents: quote.balance_cents, strong: true });
  }
  return await renderDocumentPdf({
    title: "Devis",
    number: quote.number,
    dateLabel: "Date du devis",
    date: quote.issue_date,
    secondaryDateLabel: "Valable jusqu'au",
    secondaryDate: quote.valid_until ?? undefined,
    issuer: issuerParty(settings),
    client: { name: quote.client_snapshot.name, lines: partyLines(quote.client_snapshot) },
    items: pdfItems(quote.items),
    totalHtCents: quote.total_ht_cents,
    vatBreakdown: vatRows(quote.vat_breakdown),
    totalTtcCents: quote.total_ttc_cents,
    extraTotals: extra,
    sections: [
      { heading: "Réalisation", text: quote.service_period },
      { heading: "Description du projet", text: quote.project_description },
      { heading: "Conditions particulières", text: quote.special_conditions },
      { heading: "Modalités de paiement", text: quote.payment_terms },
      { heading: "Conditions d'annulation", text: quote.cancellation_terms },
      { heading: "Conditions de livraison", text: quote.delivery_terms },
      { heading: "Utilisation des photographies et vidéos", text: quote.usage_terms },
      {
        heading: "Bon pour accord",
        text: "Date, signature du client précédée de la mention « Bon pour accord » :\n\n\n"
      }
    ],
    footer: footerText(settings),
    logo: await loadLogo()
  });
}

async function invoicePdf(invoice: Row, settings: Row) {
  const extra: PdfDocumentData["extraTotals"] = [];
  if (invoice.deposits_deducted_cents > 0) {
    extra.push({ label: "Acomptes déjà facturés", cents: -invoice.deposits_deducted_cents });
  }
  extra.push({ label: "Net à payer", cents: invoice.amount_due_cents, strong: true });
  return await renderDocumentPdf({
    title: invoice.kind === "deposit" ? "Facture d'acompte" : "Facture",
    number: invoice.number,
    dateLabel: "Date d'émission",
    date: invoice.issue_date,
    secondaryDateLabel: "Échéance",
    secondaryDate: invoice.due_date ?? undefined,
    issuer: issuerParty(settings),
    client: { name: invoice.client_snapshot.name, lines: partyLines(invoice.client_snapshot) },
    reference: invoice.quote_number ? `Réf. devis : ${invoice.quote_number}` : undefined,
    items: pdfItems(invoice.items),
    totalHtCents: invoice.total_ht_cents,
    vatBreakdown: vatRows(invoice.vat_breakdown),
    totalTtcCents: invoice.total_ttc_cents,
    extraTotals: extra,
    sections: [
      { heading: "Réalisation", text: invoice.service_period },
      { heading: "Notes", text: invoice.notes },
      { heading: "Modalités de paiement", text: invoice.payment_terms },
      {
        heading: "Retard de paiement",
        text: "En cas de retard de paiement, des pénalités calculées à trois fois le taux d'intérêt légal sont exigibles, ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (professionnels). Pas d'escompte pour paiement anticipé."
      }
    ],
    footer: footerText(settings),
    logo: await loadLogo()
  });
}

async function storageRequest(path: string, init: RequestInit) {
  const url = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return await fetch(`${url}/storage/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: "Bearer " + key, ...init.headers }
  });
}

function storagePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

// Un fichier existant n'est jamais écrasé : une référence supplémentaire est ajoutée.
async function uniquePdfPath(prefix: string, fileName: string, number: string) {
  const exists = async (path: string) => {
    const [q, i] = await Promise.all([
      rows(`quotes?select=id&pdf_path=${eq(path)}&limit=1`),
      rows(`invoices?select=id&pdf_path=${eq(path)}&limit=1`)
    ]);
    return q.length + i.length > 0;
  };
  let path = `${prefix}/${fileName}.pdf`;
  if (await exists(path)) path = `${prefix}/${fileName}_${number}.pdf`;
  let counter = 2;
  while (await exists(path)) path = `${prefix}/${fileName}_${number}_${counter++}.pdf`;
  return path;
}

async function archivePdf(path: string, bytes: Uint8Array) {
  const response = await storageRequest(`object/${BUCKET}/${storagePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", "x-upsert": "false" },
    body: bytes
  });
  if (!response.ok) {
    console.error("Commerce PDF upload failed", response.status, await response.text());
    throw new UserError("L'archivage du PDF a échoué.", 500);
  }
}

function fileLabel(kind: "quote" | "invoice" | "deposit") {
  return { quote: "Devis", invoice: "Facture", deposit: "Acompte" }[kind];
}

async function renderOrFail(render: () => Promise<Uint8Array>) {
  try {
    return await render();
  } catch (error) {
    console.error("Commerce PDF generation failed", error);
    throw new UserError("La génération du PDF a échoué.", 500);
  }
}

async function validateQuote(id: string) {
  const quote = await loadQuote(id);
  if (quote.number) throw new UserError("Requête invalide : ce devis est déjà validé.", 409);
  const client = (await rows(`clients?select=*&id=${eq(quote.client_id)}`))[0];
  if (!client) throw new UserError("Client introuvable.", 404);
  assertClientComplete(client);
  if (!quote.items.length) throw new UserError("Ajoutez au moins une prestation.");
  if (!quote.valid_until) throw new UserError("Date de validité invalide : à renseigner avant validation.");

  // La génération est testée avant d'attribuer un numéro, pour ne pas en perdre.
  const settings = await getSettings();
  const issueDate = todayParis();
  const snapshot = clientSnapshot(client);
  await renderOrFail(() => quotePdf({ ...quote, number: "D-0000-0000", client_snapshot: snapshot }, settings));

  const number = await databaseRequest("rpc/next_document_number", {
    method: "POST",
    body: JSON.stringify({ p_kind: "quote" })
  }) as string;
  const bytes = await renderOrFail(() =>
    quotePdf({ ...quote, number, issue_date: issueDate, client_snapshot: snapshot }, settings)
  );
  const path = await uniquePdfPath(
    "quotes",
    `${fileLabel("quote")}_${issueDate}_${normalizeFileSegment(client.name)}`,
    number
  );
  await archivePdf(path, bytes);
  await patchOne("quotes", id, {
    number,
    status: "sent",
    issue_date: issueDate,
    client_snapshot: snapshot,
    pdf_path: path,
    validated_at: new Date().toISOString()
  });
  return await loadQuote(id);
}

// ---------------------------------------------------------------- factures

async function loadInvoice(id: string) {
  const invoice = (await rows(`invoices?select=*&id=${eq(id)}`))[0];
  if (!invoice) throw new UserError("Facture introuvable.", 404);
  const [items, payments, quote] = await Promise.all([
    rows(`invoice_items?select=*&invoice_id=${eq(id)}&order=position.asc`),
    rows(`payments?select=*&invoice_id=${eq(id)}&order=paid_on.asc,created_at.asc`),
    invoice.quote_id
      ? rows(`quotes?select=number&id=${eq(invoice.quote_id)}`)
      : Promise.resolve([])
  ]);
  return { ...invoice, items, payments, quote_number: quote[0]?.number ?? null };
}

function displayInvoiceStatus(invoice: Row) {
  if (
    (invoice.status === "issued" || invoice.status === "partially_paid") &&
    invoice.due_date &&
    invoice.due_date < todayParis()
  ) return "overdue";
  return invoice.status;
}

function invoiceTotals(items: ItemInput[], deductedCents: number) {
  const totals = totalsOf(items);
  return {
    totals,
    fields: {
      total_ht_cents: totals.totalHtCents,
      total_vat_cents: totals.totalVatCents,
      total_ttc_cents: totals.totalTtcCents,
      vat_breakdown: totals.vatBreakdown,
      deposits_deducted_cents: deductedCents,
      amount_due_cents: Math.max(0, totals.totalTtcCents - deductedCents)
    }
  };
}

async function writeInvoice(body: Row) {
  const settings = await getSettings();
  const client = await upsertClient(body.client ?? {});
  const items = parseItems(body.items);
  const { totals, fields } = invoiceTotals(items, 0);
  const base = {
    kind: "invoice",
    client_id: client.id,
    client_snapshot: clientSnapshot(client),
    due_date: date(body.dueDate, "Échéance") ?? addDays(todayParis(), settings.invoice_payment_days),
    service_period: str(body.servicePeriod, "Période de réalisation", 300),
    notes: str(body.notes, "Notes", 4000),
    payment_terms: str(body.paymentTerms, "Modalités de paiement", 4000) || settings.default_payment_terms,
    ...fields
  };
  let invoice: Row;
  if (body.invoiceId) {
    const id = uuid(body.invoiceId, "Facture");
    const existing = (await rows(`invoices?select=number,quote_id&id=${eq(id)}`))[0];
    if (!existing) throw new UserError("Facture introuvable.", 404);
    if (existing.number) {
      throw new UserError("Requête invalide : une facture émise ne peut plus être modifiée.", 409);
    }
    invoice = await patchOne("invoices", id, base);
    await databaseRequest(`invoice_items?invoice_id=${eq(id)}`, { method: "DELETE" });
  } else {
    invoice = await insertOne("invoices", { ...base, issue_date: todayParis() });
  }
  await saveCatalogItems(items);
  await databaseRequest("invoice_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(itemRows("invoice_id", invoice.id, items, totals.lineTotals, false))
  });
  return await loadInvoice(invoice.id);
}

async function invoiceFromQuote(quoteId: string, mode: string) {
  const quote = await loadQuote(quoteId);
  if (quote.status !== "accepted") {
    throw new UserError("Requête invalide : seul un devis accepté peut être facturé.", 409);
  }
  const settings = await getSettings();
  const siblings = await rows(
    `invoices?select=id,kind,status,total_ttc_cents&quote_id=${eq(quoteId)}&status=neq.cancelled`
  );
  let items: ItemInput[];
  let kind: "invoice" | "deposit";
  let deducted = 0;

  if (mode === "deposit") {
    if (!quote.deposit_enabled || quote.deposit_cents <= 0) {
      throw new UserError("Requête invalide : ce devis ne prévoit pas d'acompte.", 409);
    }
    if (siblings.some((entry) => entry.kind === "deposit")) {
      throw new UserError("Requête invalide : une facture d'acompte existe déjà pour ce devis.", 409);
    }
    kind = "deposit";
    const ratio = quote.deposit_cents / quote.total_ttc_cents;
    items = (quote.vat_breakdown as Row[]).map((row) => ({
      service_id: null,
      title: `Acompte de ${formatRate(quote.deposit_bps)} — devis ${quote.number}`,
      description: `TVA ${formatRate(row.rateBps)}`,
      quantity: 1,
      unit: "forfait",
      unit_price_cents: Math.round(row.baseCents * ratio),
      vat_rate_bps: row.rateBps,
      saveToCatalog: false
    }));
  } else {
    if (siblings.some((entry) => entry.kind === "invoice")) {
      throw new UserError("Requête invalide : une facture existe déjà pour ce devis.", 409);
    }
    kind = "invoice";
    deducted = siblings
      .filter((entry) => entry.kind === "deposit" && entry.status !== "draft")
      .reduce((sum, entry) => sum + entry.total_ttc_cents, 0);
    items = (quote.items as Row[]).map((item) => ({
      service_id: null,
      title: item.title,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      unit_price_cents: item.unit_price_cents,
      vat_rate_bps: item.vat_rate_bps,
      saveToCatalog: false
    }));
  }

  const { totals, fields } = invoiceTotals(items, deducted);
  const invoice = await insertOne("invoices", {
    kind,
    quote_id: quote.id,
    client_id: quote.client_id,
    client_snapshot: quote.client_snapshot,
    issue_date: todayParis(),
    due_date: addDays(todayParis(), settings.invoice_payment_days),
    service_period: quote.service_period,
    payment_terms: quote.payment_terms || settings.default_payment_terms,
    ...fields
  });
  await databaseRequest("invoice_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(itemRows("invoice_id", invoice.id, items, totals.lineTotals, false))
  });
  return await loadInvoice(invoice.id);
}

async function issueInvoice(id: string) {
  const invoice = await loadInvoice(id);
  if (invoice.number) throw new UserError("Requête invalide : cette facture est déjà émise.", 409);
  const client = (await rows(`clients?select=*&id=${eq(invoice.client_id)}`))[0];
  if (!client) throw new UserError("Client introuvable.", 404);
  assertClientComplete(client);
  if (!invoice.items.length) throw new UserError("Ajoutez au moins une prestation.");

  // Les acomptes facturés depuis la création du brouillon sont déduits à l'émission.
  if (invoice.kind === "invoice" && invoice.quote_id) {
    const deposits = await rows(
      `invoices?select=total_ttc_cents,status&quote_id=${eq(invoice.quote_id)}&kind=eq.deposit&status=neq.cancelled`
    );
    const deducted = deposits
      .filter((entry) => entry.status !== "draft")
      .reduce((sum, entry) => sum + entry.total_ttc_cents, 0);
    invoice.deposits_deducted_cents = deducted;
    invoice.amount_due_cents = Math.max(0, invoice.total_ttc_cents - deducted);
  }

  const settings = await getSettings();
  const issueDate = todayParis();
  const snapshot = clientSnapshot(client);
  await renderOrFail(() => invoicePdf({ ...invoice, number: "F-0000-0000", client_snapshot: snapshot }, settings));

  const number = await databaseRequest("rpc/next_document_number", {
    method: "POST",
    body: JSON.stringify({ p_kind: invoice.kind === "deposit" ? "deposit" : "invoice" })
  }) as string;
  const bytes = await renderOrFail(() =>
    invoicePdf({ ...invoice, number, issue_date: issueDate, client_snapshot: snapshot }, settings)
  );
  const path = await uniquePdfPath(
    "invoices",
    `${fileLabel(invoice.kind)}_${issueDate}_${normalizeFileSegment(client.name)}`,
    number
  );
  await archivePdf(path, bytes);
  await patchOne("invoices", id, {
    number,
    status: "issued",
    issue_date: issueDate,
    client_snapshot: snapshot,
    deposits_deducted_cents: invoice.deposits_deducted_cents,
    amount_due_cents: invoice.amount_due_cents,
    pdf_path: path,
    issued_at: new Date().toISOString()
  });
  return await loadInvoice(id);
}

// Un règlement ne modifie jamais le PDF déjà émis.
async function addPayment(body: Row) {
  const invoiceId = uuid(body.invoiceId, "Facture");
  const invoice = (await rows(`invoices?select=*&id=${eq(invoiceId)}`))[0];
  if (!invoice) throw new UserError("Facture introuvable.", 404);
  if (invoice.status !== "issued" && invoice.status !== "partially_paid") {
    throw new UserError("Requête invalide : cette facture n'accepte pas de règlement.", 409);
  }
  const amount = integer(body.amountCents, "Montant", 1, 100_000_000);
  const remaining = invoice.amount_due_cents - invoice.paid_cents;
  if (amount > remaining) {
    throw new UserError(`Montant invalide : le reste à payer est de ${formatMoney(remaining)}.`);
  }
  const method = String(body.method);
  if (!["virement", "carte", "especes", "cheque", "autre"].includes(method)) {
    throw new UserError("Mode de paiement invalide.");
  }
  await insertOne("payments", {
    invoice_id: invoiceId,
    paid_on: date(body.paidOn, "Date du paiement", true),
    amount_cents: amount,
    method,
    reference: str(body.reference, "Référence", 200),
    comment: str(body.comment, "Commentaire", 1000)
  });
  const paid = invoice.paid_cents + amount;
  await patchOne("invoices", invoiceId, {
    paid_cents: paid,
    status: paid >= invoice.amount_due_cents ? "paid" : "partially_paid"
  });
  return await loadInvoice(invoiceId);
}

// ---------------------------------------------------------------- documents

async function documentRecord(kind: unknown, idValue: unknown) {
  const id = uuid(idValue, "Document");
  if (kind === "quote") return (await rows(`quotes?select=*&id=${eq(id)}`))[0];
  if (kind === "invoice") return (await rows(`invoices?select=*&id=${eq(id)}`))[0];
  throw new UserError("Type de document invalide.");
}

async function signedUrl(path: string, expiresIn: number) {
  const response = await storageRequest(`object/sign/${BUCKET}/${storagePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.signedURL) throw new UserError("Le lien du document est indisponible.", 500);
  return `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/storage/v1${result.signedURL}`;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function escapeHtml(value: string) {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => map[char]);
}

async function sendDocument(body: Row) {
  const record = await documentRecord(body.kind, body.id);
  if (!record?.pdf_path) throw new UserError("Requête invalide : le document n'est pas encore validé.", 409);
  const to = str(body.to, "Destinataire", 254, true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new UserError("Adresse e-mail invalide.");
  const message = str(body.message, "Message", 4000);

  const download = await storageRequest(`object/${BUCKET}/${storagePath(record.pdf_path)}`, { method: "GET" });
  if (!download.ok) throw new UserError("Le PDF archivé est introuvable.", 500);
  const bytes = new Uint8Array(await download.arrayBuffer());
  const fileName = record.pdf_path.split("/").pop() as string;
  const label = body.kind === "quote" ? "Devis" : "Facture";
  const text = message || "Bonjour,\n\nVeuillez trouver ci-joint votre document.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + requiredEnv("RESEND_API_KEY"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: requiredEnv("ORDER_EMAIL_FROM"),
      to: [to],
      subject: `${label} ${record.number} — Alexandre Palanca`,
      text: `${text}\n\nAlexandre Palanca`,
      html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p><p>Alexandre Palanca</p>`,
      attachments: [{ filename: fileName, content: toBase64(bytes) }]
    })
  });
  if (!response.ok) {
    console.error("Resend rejected a commerce document", response.status);
    throw new UserError("L'e-mail n'a pas pu être envoyé.", 502);
  }
  return { sent: true };
}

// ---------------------------------------------------------------- listes

async function dashboard() {
  const [quotes, invoices, drafts] = await Promise.all([
    rows("quotes?select=status,valid_until&number=not.is.null"),
    rows("invoices?select=status,total_ttc_cents,amount_due_cents,paid_cents&number=not.is.null"),
    rows("quotes?select=id&number=is.null")
  ]);
  const live = invoices.filter((invoice) => invoice.status !== "cancelled");
  return {
    quotesPending: drafts.length + quotes.filter((q) => displayQuoteStatus(q) === "sent").length,
    quotesAccepted: quotes.filter((q) => q.status === "accepted").length,
    invoicesUnpaid: live.filter((i) => i.status === "issued" || i.status === "partially_paid").length,
    invoicesPaid: live.filter((i) => i.status === "paid").length,
    totalInvoicedCents: live.reduce((sum, i) => sum + i.total_ttc_cents, 0),
    remainingCents: live.reduce((sum, i) => sum + (i.amount_due_cents - i.paid_cents), 0)
  };
}

async function clientDetail(id: string) {
  const client = (await rows(`clients?select=*&id=${eq(id)}`))[0];
  if (!client) throw new UserError("Client introuvable.", 404);
  const [quotes, invoices] = await Promise.all([
    rows(`quotes?select=id,number,status,issue_date,total_ttc_cents,valid_until&client_id=${eq(id)}&order=created_at.desc`),
    rows(`invoices?select=id,number,kind,status,issue_date,due_date,total_ttc_cents,amount_due_cents,paid_cents&client_id=${eq(id)}&order=created_at.desc`)
  ]);
  const ids = invoices.map((invoice) => invoice.id);
  const payments = ids.length
    ? await rows(`payments?select=*&invoice_id=in.(${ids.join(",")})&order=paid_on.desc`)
    : [];
  return {
    client,
    quotes: quotes.map((q) => ({ ...q, status: displayQuoteStatus(q) })),
    invoices: invoices.map((i) => ({ ...i, status: displayInvoiceStatus(i) })),
    payments
  };
}

function settingsFields(s: Row) {
  return {
    legal_name: str(s.legal_name, "Nom légal", 200, true),
    trade_name: str(s.trade_name, "Nom commercial", 200),
    siren: str(s.siren, "SIREN", 20),
    address: str(s.address, "Adresse", 300),
    postal_code: str(s.postal_code, "Code postal", 20),
    city: str(s.city, "Ville", 120),
    email: str(s.email, "E-mail", 254),
    phone: str(s.phone, "Téléphone", 40),
    iban: str(s.iban, "IBAN", 50),
    vat_mention: str(s.vat_mention, "Mention TVA", 500),
    legal_footer: str(s.legal_footer, "Mentions légales", 1000),
    default_payment_terms: str(s.default_payment_terms, "Modalités de paiement", 4000),
    default_cancellation_terms: str(s.default_cancellation_terms, "Conditions d'annulation", 4000),
    default_delivery_terms: str(s.default_delivery_terms, "Conditions de livraison", 4000),
    default_usage_terms: str(s.default_usage_terms, "Conditions d'utilisation", 4000),
    default_validity_days: integer(s.default_validity_days, "Validité par défaut", 1, 365),
    default_deposit_bps: integer(s.default_deposit_bps, "Acompte par défaut", 0, 10000),
    invoice_payment_days: integer(s.invoice_payment_days, "Délai de paiement", 0, 120)
  };
}

// ---------------------------------------------------------------- routeur

async function handle(body: Row) {
  switch (body.action) {
    case "dashboard":
      return await dashboard();

    case "get-settings":
      return { settings: await getSettings() };
    case "save-settings":
      return {
        settings: (await rows("commerce_settings?id=eq.1&select=*", {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ ...settingsFields(body.settings ?? {}), updated_at: new Date().toISOString() })
        }))[0]
      };

    case "list-clients": {
      const q = str(body.q, "Recherche", 100).replace(/[%*,()]/g, " ").trim();
      const filter = q
        ? `&or=(name.ilike.*${encodeURIComponent(q)}*,email.ilike.*${encodeURIComponent(q)}*)`
        : "";
      return { clients: await rows(`clients?select=*&order=name.asc&limit=200${filter}`) };
    }
    case "get-client":
      return await clientDetail(uuid(body.id, "Client"));
    case "save-client":
      return { client: await upsertClient(body.client ?? {}) };

    case "list-services": {
      const filter = body.includeInactive ? "" : "&active=is.true";
      return { services: await rows(`services?select=*&order=name.asc${filter}`) };
    }
    case "save-service": {
      const s = body.service ?? {};
      const data = {
        name: str(s.name, "Nom", 200, true),
        description: str(s.description, "Description", 1000),
        unit_price_cents: integer(s.unitPriceCents, "Prix", 0, 100_000_000),
        unit: str(s.unit, "Unité", 30) || "unité",
        vat_rate_bps: integer(s.vatRateBps, "Taux de TVA", 0, 10000),
        category: str(s.category, "Catégorie", 100),
        active: s.active !== false
      };
      return {
        service: s.id
          ? await patchOne("services", uuid(s.id, "Prestation"), data)
          : await insertOne("services", data)
      };
    }
    case "delete-service": {
      const id = uuid(body.id, "Prestation");
      const used = await rows(`quote_items?select=id&service_id=${eq(id)}&limit=1`);
      if (used.length) {
        throw new UserError("Requête invalide : cette prestation figure dans des devis ; désactivez-la plutôt.", 409);
      }
      await databaseRequest(`services?id=${eq(id)}`, { method: "DELETE" });
      return { deleted: true };
    }

    case "list-quotes": {
      const list = await rows(
        "quotes?select=id,number,status,issue_date,valid_until,total_ttc_cents,client_snapshot,pdf_path&order=created_at.desc&limit=500"
      );
      return {
        quotes: list.map((q) => ({
          ...q,
          status: displayQuoteStatus(q),
          client_name: q.client_snapshot?.name ?? ""
        }))
      };
    }
    case "get-quote": {
      const quote = await loadQuote(uuid(body.id, "Devis"));
      const invoices = await rows(
        `invoices?select=id,number,kind,status,total_ttc_cents,paid_cents&quote_id=${eq(quote.id)}&status=neq.cancelled`
      );
      const deposits = invoices.filter((entry) => entry.kind === "deposit");
      return {
        quote: { ...quote, status: displayQuoteStatus(quote) },
        invoices,
        deposit: {
          requestedCents: quote.deposit_cents,
          invoicedCents: deposits
            .filter((entry) => entry.status !== "draft")
            .reduce((sum, entry) => sum + entry.total_ttc_cents, 0),
          receivedCents: deposits.reduce((sum, entry) => sum + entry.paid_cents, 0)
        }
      };
    }
    case "save-quote":
      return { quote: await saveQuote(body) };
    case "validate-quote":
      return { quote: await validateQuote(uuid(body.id, "Devis")) };
    case "set-quote-status": {
      const id = uuid(body.id, "Devis");
      const status = String(body.status);
      if (!["sent", "accepted", "refused", "expired"].includes(status)) {
        throw new UserError("Statut invalide.");
      }
      const current = (await rows(`quotes?select=number&id=${eq(id)}`))[0];
      if (!current?.number) throw new UserError("Requête invalide : validez d'abord le devis.", 409);
      await patchOne("quotes", id, { status });
      return { quote: await loadQuote(id) };
    }
    case "delete-quote": {
      const id = uuid(body.id, "Devis");
      const current = (await rows(`quotes?select=number&id=${eq(id)}`))[0];
      if (current?.number) {
        throw new UserError("Requête invalide : un devis numéroté ne peut pas être supprimé.", 409);
      }
      await databaseRequest(`quotes?id=${eq(id)}`, { method: "DELETE" });
      return { deleted: true };
    }

    case "list-invoices": {
      const list = await rows(
        "invoices?select=id,number,kind,status,issue_date,due_date,total_ttc_cents,amount_due_cents,paid_cents,client_snapshot,pdf_path&order=created_at.desc&limit=500"
      );
      return {
        invoices: list.map((i) => ({
          ...i,
          status: displayInvoiceStatus(i),
          remaining_cents: i.status === "draft" || i.status === "cancelled"
            ? 0
            : i.amount_due_cents - i.paid_cents,
          client_name: i.client_snapshot?.name ?? ""
        }))
      };
    }
    case "get-invoice": {
      const invoice = await loadInvoice(uuid(body.id, "Facture"));
      return { invoice: { ...invoice, status: displayInvoiceStatus(invoice) } };
    }
    case "save-invoice":
      return { invoice: await writeInvoice(body) };
    case "invoice-from-quote":
      return {
        invoice: await invoiceFromQuote(uuid(body.quoteId, "Devis"), body.mode === "deposit" ? "deposit" : "final")
      };
    case "issue-invoice":
      return { invoice: await issueInvoice(uuid(body.id, "Facture")) };
    case "delete-invoice": {
      const id = uuid(body.id, "Facture");
      const current = (await rows(`invoices?select=number&id=${eq(id)}`))[0];
      if (current?.number) {
        throw new UserError(
          "Requête invalide : une facture émise ne peut pas être supprimée ; elle se corrige par un avoir.",
          409
        );
      }
      await databaseRequest(`invoices?id=${eq(id)}`, { method: "DELETE" });
      return { deleted: true };
    }
    case "add-payment":
      return { invoice: await addPayment(body) };

    case "document-url": {
      const record = await documentRecord(body.kind, body.id);
      if (!record?.pdf_path) throw new UserError("Requête invalide : le document n'est pas encore validé.", 409);
      const days = integer(body.days ?? 1, "Durée", 1, 30);
      return {
        url: await signedUrl(record.pdf_path, days * 24 * 3600),
        fileName: String(record.pdf_path).split("/").pop()
      };
    }
    case "send-document":
      return await sendDocument(body);

    default:
      throw new UserError("Requête invalide : action inconnue.");
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  try {
    assertBrowserOrigin(request);
    await requireAdmin(request);
    if (request.method !== "POST") {
      return jsonResponse(request, 405, { message: "Méthode non autorisée." });
    }
    const body = await readJson(request);
    return jsonResponse(request, 200, await handle(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
    const status = error instanceof UserError
      ? error.status
      : message.includes("Origine") || message.includes("Accès administrateur") ? 403
      : message.includes("Session administrateur") ? 401
      : message.includes("invalide") ? 400
      : 500;
    if (status >= 500) console.error("Commerce function error", error);
    return jsonResponse(request, status, {
      message: status >= 500 && !(error instanceof UserError) ? "Une erreur est survenue." : message
    });
  }
});
