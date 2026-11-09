import { callGalleryFunction } from "./galeries-api.js";

const TOKEN_KEY = "gallery-admin-access-token";
const token = window.sessionStorage.getItem(TOKEN_KEY);
if (!token) window.location.replace("admin.html");

const view = document.getElementById("com-view");
const tabsEl = document.getElementById("com-tabs");
const msgEl = document.getElementById("com-msg");

const TABS = [
  ["dashboard", "Tableau de bord"],
  ["quotes", "Devis"],
  ["invoices", "Factures"],
  ["clients", "Clients"],
  ["services", "Prestations"],
  ["settings", "Réglages"]
];

// Deux prestataires indépendants : chaque devis, facture et prestation appartient à l'un d'eux.
const ISSUERS = [["alexandre", "Alexandre Palanca", "Photo & vidéo"], ["elisa", "Elisa Martignac", "Sites internet"]];
const issuerLabel = (key) => (ISSUERS.find(([k]) => k === key) || ISSUERS[0])[1];
const issuerTag = (key) => `<span class="com-issuer is-${key === "elisa" ? "elisa" : "alexandre"}">${key === "elisa" ? "EM" : "AP"}</span>`;
let listIssuer = "all";
const issuerFilter = (current) => `<div class="com-issuer-filter">${[["all", "Tous"], ...ISSUERS.map(([k, n]) => [k, n])].map(([k, n]) =>
  `<button type="button" class="gallery-quiet-button${current === k ? " is-active" : ""}" data-issuer-filter="${k}">${n}</button>`).join("")}</div>`;
const newQuoteButtons = () => ISSUERS.map(([k, n, what]) =>
  `<button class="gallery-primary-button" type="button" data-new-quote="${k}">Nouveau devis — ${what} (${n.split(" ")[0]})</button>`).join("");
function bindNewQuote() {
  view.querySelectorAll("[data-new-quote]").forEach((b) => b.onclick = () => quoteEditor(null, null, { issuer: b.dataset.newQuote }));
}

const QUOTE_STATUS = {
  draft: ["Brouillon", ""], sent: ["Envoyé", "warn"], accepted: ["Accepté", "ok"],
  refused: ["Refusé", "bad"], expired: ["Expiré", "bad"]
};
const INVOICE_STATUS = {
  draft: ["Brouillon", ""], issued: ["Émise", "warn"], partially_paid: ["Partiellement payée", "warn"],
  paid: ["Payée", "ok"], overdue: ["En retard", "bad"], cancelled: ["Annulée", "bad"]
};

async function api(action, body = {}) {
  try {
    return await callGalleryFunction("commerce-api", { body: { action, ...body }, accessToken: token });
  } catch (error) {
    if (/Session administrateur/.test(error.message)) {
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.location.replace("admin.html");
    }
    throw error;
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const money = (cents) => `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const dateFr = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const today = () => new Date().toISOString().slice(0, 10);
const toCents = (text) => Math.max(0, Math.round((parseFloat(String(text).replace(",", ".")) || 0) * 100));
const toEuros = (cents) => (cents / 100).toFixed(2);

function say(text, ok = false) {
  msgEl.textContent = text || "";
  msgEl.classList.toggle("is-ok", ok);
}
async function run(task) {
  say("");
  try {
    return await task();
  } catch (error) {
    say(error.message);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return null;
  }
}
function badge(map, status) {
  const [label, tone] = map[status] || [status, ""];
  return `<span class="com-badge ${tone}">${esc(label)}</span>`;
}
function field(label, inner) {
  return `<label class="gallery-admin-label">${esc(label)}${inner}</label>`;
}
function input(name, value, attrs = "") {
  return `<input class="gallery-admin-input" data-k="${name}" value="${esc(value)}" ${attrs}>`;
}
function textarea(name, value) {
  return `<textarea class="gallery-admin-input" data-k="${name}">${esc(value)}</textarea>`;
}

// ------------------------------------------------------------ navigation

let currentTab = "dashboard";
function renderTabs() {
  tabsEl.innerHTML = TABS.map(([id, label]) =>
    `<button class="com-tab" type="button" role="tab" data-tab="${id}" aria-selected="${id === currentTab}">${label}</button>`
  ).join("");
}
tabsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (button) go(button.dataset.tab);
});
function go(tab, ...args) {
  currentTab = tab;
  renderTabs();
  say("");
  const screens = { dashboard, quotes, invoices, clients, services, settings };
  screens[tab](...args);
}

// ------------------------------------------------------------ tableau de bord

async function dashboard() {
  view.innerHTML = "<p>Chargement…</p>";
  const all = await run(() => api("dashboard"));
  if (!all) return;
  // Chiffres séparés par prestataire : jamais additionnés
  const block = ([key, name, what]) => {
    const data = all[key];
    const cards = [
      ["Devis en attente", data.quotesPending], ["Devis acceptés", data.quotesAccepted],
      ["Factures impayées", data.invoicesUnpaid], ["Factures payées", data.invoicesPaid],
      ["Total facturé", money(data.totalInvoicedCents)], ["Reste à encaisser", money(data.remainingCents)]
    ];
    return `<h2 class="com-issuer-title">${issuerTag(key)} ${esc(name)} <small>${esc(what)}</small></h2>
      <div class="com-cards">${cards.map(([l, v]) => `<div class="com-card"><span>${l}</span><strong>${v}</strong></div>`).join("")}</div>`;
  };
  view.innerHTML = `${ISSUERS.map(block).join("")}<div class="com-actions">${newQuoteButtons()}</div>`;
  bindNewQuote();
}

// ------------------------------------------------------------ listes

async function quotes() {
  view.innerHTML = "<p>Chargement…</p>";
  const data = await run(() => api("list-quotes"));
  if (!data) return;
  const shown = data.quotes.filter((q) => listIssuer === "all" || q.issuer === listIssuer);
  view.innerHTML = `<div class="com-actions">${newQuoteButtons()}</div>${issuerFilter(listIssuer)}
    <div class="com-table-wrap"><table class="com-table"><thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th>Validité</th><th class="com-num">Total TTC</th><th>Statut</th></tr></thead><tbody>
    ${shown.map((q) => `<tr class="is-click" data-id="${q.id}" data-num="${q.number ? 1 : ""}"><td>${issuerTag(q.issuer)} ${esc(q.number || "Brouillon")}</td><td>${esc(q.client_name)}</td><td>${dateFr(q.issue_date)}</td><td>${dateFr(q.valid_until)}</td><td class="com-num">${money(q.total_ttc_cents)}</td><td>${badge(QUOTE_STATUS, q.status)}</td></tr>`).join("") || '<tr><td colspan="6">Aucun devis.</td></tr>'}
    </tbody></table></div>`;
  bindNewQuote();
  view.querySelectorAll("[data-issuer-filter]").forEach((b) => b.onclick = () => { listIssuer = b.dataset.issuerFilter; quotes(); });
  view.querySelectorAll("tr[data-id]").forEach((row) => {
    row.onclick = () => (row.dataset.num ? quoteDetail(row.dataset.id) : quoteEditor(row.dataset.id));
  });
}

async function invoices() {
  view.innerHTML = "<p>Chargement…</p>";
  const data = await run(() => api("list-invoices"));
  if (!data) return;
  const shown = data.invoices.filter((i) => listIssuer === "all" || i.issuer === listIssuer);
  view.innerHTML = `${issuerFilter(listIssuer)}<div class="com-table-wrap"><table class="com-table"><thead><tr><th>Numéro</th><th>Type</th><th>Client</th><th>Date</th><th>Échéance</th><th class="com-num">Total TTC</th><th class="com-num">Reste dû</th><th>Statut</th></tr></thead><tbody>
    ${shown.map((i) => `<tr class="is-click" data-id="${i.id}"><td>${issuerTag(i.issuer)} ${esc(i.number || "Brouillon")}</td><td>${i.kind === "deposit" ? "Acompte" : "Facture"}</td><td>${esc(i.client_name)}</td><td>${dateFr(i.issue_date)}</td><td>${dateFr(i.due_date)}</td><td class="com-num">${money(i.total_ttc_cents)}</td><td class="com-num">${money(i.remaining_cents)}</td><td>${badge(INVOICE_STATUS, i.status)}</td></tr>`).join("") || '<tr><td colspan="8">Aucune facture. Elles se créent depuis un devis accepté.</td></tr>'}
    </tbody></table></div>`;
  view.querySelectorAll("[data-issuer-filter]").forEach((b) => b.onclick = () => { listIssuer = b.dataset.issuerFilter; invoices(); });
  view.querySelectorAll("tr[data-id]").forEach((row) => { row.onclick = () => invoiceDetail(row.dataset.id); });
}

// ------------------------------------------------------------ clients

const EMPTY_CLIENT = { type: "particulier", name: "", email: "", phone: "", address: "", postalCode: "", city: "", country: "France", siret: "", vatNumber: "" };
const clientFromRow = (c) => ({
  id: c.id, type: c.type, name: c.name, email: c.email, phone: c.phone, address: c.address,
  postalCode: c.postal_code, city: c.city, country: c.country, siret: c.siret, vatNumber: c.vat_number
});

function clientFields(c) {
  return `${field("Type", `<select class="gallery-admin-input" data-k="type"><option value="particulier" ${c.type === "particulier" ? "selected" : ""}>Particulier</option><option value="professionnel" ${c.type === "professionnel" ? "selected" : ""}>Professionnel</option></select>`)}
    ${field("Nom ou raison sociale", input("name", c.name))}
    <div class="com-row">${field("E-mail", input("email", c.email, 'type="email"'))}${field("Téléphone", input("phone", c.phone))}</div>
    ${field("Adresse", input("address", c.address))}
    <div class="com-row3 com-row">${field("Code postal", input("postalCode", c.postalCode))}${field("Ville", input("city", c.city))}${field("Pays", input("country", c.country))}</div>
    <div class="com-row">${field("SIRET (professionnel)", input("siret", c.siret))}${field("N° de TVA", input("vatNumber", c.vatNumber))}</div>`;
}
function bindFields(root, target, onChange) {
  root.querySelectorAll("[data-k]").forEach((el) => {
    el.addEventListener("input", () => { target[el.dataset.k] = el.value; onChange?.(); });
    el.addEventListener("change", () => { target[el.dataset.k] = el.value; onChange?.(); });
  });
}

async function clients(selectedId) {
  view.innerHTML = `<div class="com-layout"><div class="com-panel"><h2>Clients</h2>
    <input class="gallery-admin-input" id="client-q" placeholder="Rechercher par nom ou e-mail"><div id="client-list" class="com-table-wrap"></div></div>
    <div class="com-panel" id="client-detail"><p>Sélectionnez un client ou créez-en un.</p></div></div>`;
  const list = document.getElementById("client-list");
  const loadList = async () => {
    const data = await run(() => api("list-clients", { q: document.getElementById("client-q").value }));
    if (!data) return;
    list.innerHTML = `<table class="com-table"><tbody>${data.clients.map((c) => `<tr class="is-click" data-id="${c.id}"><td>${esc(c.name)}<br><small>${esc(c.email)}</small></td></tr>`).join("") || "<tr><td>Aucun client.</td></tr>"}</tbody></table>
      <p><button class="gallery-quiet-button" id="client-new" type="button">+ Nouveau client</button></p>`;
    list.querySelectorAll("tr[data-id]").forEach((row) => { row.onclick = () => showClient(row.dataset.id); });
    document.getElementById("client-new").onclick = () => editClient({ ...EMPTY_CLIENT });
  };
  let timer;
  document.getElementById("client-q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(loadList, 250); });
  await loadList();
  if (selectedId) showClient(selectedId);
}

function editClient(client) {
  const box = document.getElementById("client-detail");
  box.innerHTML = `<h2>${client.id ? "Modifier le client" : "Nouveau client"}</h2><div class="com-form">${clientFields(client)}
    <div class="com-actions"><button class="gallery-primary-button" id="client-save" type="button">Enregistrer</button></div></div>`;
  bindFields(box, client);
  document.getElementById("client-save").onclick = async () => {
    const data = await run(() => api("save-client", { client }));
    if (data) { say("Client enregistré.", true); go("clients", data.client.id); }
  };
}

async function showClient(id) {
  const box = document.getElementById("client-detail");
  const data = await run(() => api("get-client", { id }));
  if (!data) return;
  const c = data.client;
  const total = data.invoices.reduce((s, i) => s + (i.status === "cancelled" ? 0 : i.total_ttc_cents), 0);
  const paid = data.payments.reduce((s, p) => s + p.amount_cents, 0);
  box.innerHTML = `<div class="com-detail"><h2>${esc(c.name)}</h2>
    <dl><dt>Type</dt><dd>${esc(c.type)}</dd><dt>E-mail</dt><dd>${esc(c.email) || "—"}</dd><dt>Téléphone</dt><dd>${esc(c.phone) || "—"}</dd>
    <dt>Adresse</dt><dd>${esc([c.address, `${c.postal_code} ${c.city}`.trim(), c.country].filter(Boolean).join(", ")) || "—"}</dd>
    <dt>SIRET</dt><dd>${esc(c.siret) || "—"}</dd><dt>Facturé</dt><dd>${money(total)}</dd><dt>Payé</dt><dd>${money(paid)}</dd></dl>
    <div class="com-actions"><button class="gallery-quiet-button" id="client-edit" type="button">Modifier</button>
    <button class="gallery-quiet-button" id="client-quote" type="button">Nouveau devis</button></div>
    <h3>Devis</h3>${data.quotes.map((q) => `<p><a href="#" data-q="${q.id}" data-n="${q.number ? 1 : ""}">${esc(q.number || "Brouillon")}</a> — ${money(q.total_ttc_cents)} ${badge(QUOTE_STATUS, q.status)}</p>`).join("") || "<p>Aucun.</p>"}
    <h3>Factures</h3>${data.invoices.map((i) => `<p><a href="#" data-i="${i.id}">${esc(i.number || "Brouillon")}</a> — ${money(i.total_ttc_cents)} ${badge(INVOICE_STATUS, i.status)}</p>`).join("") || "<p>Aucune.</p>"}</div>`;
  document.getElementById("client-edit").onclick = () => editClient(clientFromRow(c));
  document.getElementById("client-quote").onclick = () => quoteEditor(null, clientFromRow(c));
  box.querySelectorAll("[data-q]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); a.dataset.n ? quoteDetail(a.dataset.q) : quoteEditor(a.dataset.q); }));
  box.querySelectorAll("[data-i]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); invoiceDetail(a.dataset.i); }));
}

// ------------------------------------------------------------ prestations

let serviceIssuer = "alexandre";
async function services() {
  view.innerHTML = "<p>Chargement…</p>";
  const data = await run(() => api("list-services", { includeInactive: true, issuer: serviceIssuer }));
  if (!data) return;
  view.innerHTML = `<div class="com-issuer-filter">${ISSUERS.map(([k, n]) => `<button type="button" class="gallery-quiet-button${serviceIssuer === k ? " is-active" : ""}" data-svc-issuer="${k}">${n}</button>`).join("")}</div>
    <div class="com-layout"><div class="com-panel"><h2>Catalogue — ${esc(issuerLabel(serviceIssuer))}</h2><div class="com-table-wrap"><table class="com-table"><thead><tr><th>Prestation</th><th class="com-num">Prix HT</th><th>Unité</th><th>TVA</th></tr></thead><tbody>
    ${data.services.map((s) => `<tr class="is-click" data-id="${s.id}"><td>${esc(s.name)}${s.active ? "" : " <small>(désactivée)</small>"}</td><td class="com-num">${money(s.unit_price_cents)}</td><td>${esc(s.unit)}</td><td>${s.vat_rate_bps / 100} %</td></tr>`).join("") || '<tr><td colspan="4">Catalogue vide.</td></tr>'}
    </tbody></table></div><p><button class="gallery-quiet-button" id="svc-new" type="button">+ Nouvelle prestation</button></p></div>
    <div class="com-panel" id="svc-form"><p>Sélectionnez une prestation ou créez-en une.</p></div></div>`;
  const edit = (s) => {
    const box = document.getElementById("svc-form");
    const model = { id: s.id, name: s.name || "", description: s.description || "", unit: s.unit || "forfait", category: s.category || "", price: toEuros(s.unit_price_cents || 0), vat: String((s.vat_rate_bps ?? 0) / 100), active: s.active !== false };
    box.innerHTML = `<h2>${s.id ? "Modifier" : "Nouvelle prestation"}</h2><div class="com-form">
      ${field("Nom", input("name", model.name))}${field("Description", textarea("description", model.description))}
      <div class="com-row3 com-row">${field("Prix HT (€)", input("price", model.price, 'inputmode="decimal"'))}${field("Unité", input("unit", model.unit))}${field("TVA (%)", input("vat", model.vat, 'inputmode="decimal"'))}</div>
      ${field("Catégorie", input("category", model.category))}
      <label class="com-check"><input type="checkbox" id="svc-active" ${model.active ? "checked" : ""}> Active</label>
      <div class="com-actions"><button class="gallery-primary-button" id="svc-save" type="button">Enregistrer</button>${s.id ? '<button class="gallery-quiet-button" id="svc-del" type="button">Supprimer</button>' : ""}</div></div>`;
    bindFields(box, model);
    document.getElementById("svc-active").onchange = (e) => { model.active = e.target.checked; };
    document.getElementById("svc-save").onclick = async () => {
      const ok = await run(() => api("save-service", { service: { id: model.id, issuer: serviceIssuer, name: model.name, description: model.description, unit: model.unit, category: model.category, active: model.active, unitPriceCents: toCents(model.price), vatRateBps: Math.round((parseFloat(String(model.vat).replace(",", ".")) || 0) * 100) } }));
      if (ok) { say("Prestation enregistrée.", true); services(); }
    };
    const del = document.getElementById("svc-del");
    if (del) del.onclick = async () => {
      if (!confirm("Supprimer cette prestation ?")) return;
      if (await run(() => api("delete-service", { id: model.id }))) services();
    };
  };
  document.getElementById("svc-new").onclick = () => edit({});
  view.querySelectorAll("[data-svc-issuer]").forEach((b) => b.onclick = () => { serviceIssuer = b.dataset.svcIssuer; services(); });
  view.querySelectorAll("tr[data-id]").forEach((row) => { row.onclick = () => edit(data.services.find((s) => s.id === row.dataset.id)); });
}

// ------------------------------------------------------------ réglages

let settingsIssuer = "alexandre";
async function settings() {
  view.innerHTML = "<p>Chargement…</p>";
  const data = await run(() => api("get-settings", { issuer: settingsIssuer }));
  if (!data) return;
  const s = { ...data.settings };
  const text = (k, label) => field(label, input(k, s[k] ?? ""));
  const area = (k, label) => field(label, textarea(k, s[k] ?? ""));
  view.innerHTML = `<div class="com-issuer-filter">${ISSUERS.map(([k, n]) => `<button type="button" class="gallery-quiet-button${settingsIssuer === k ? " is-active" : ""}" data-set-issuer="${k}">${n}</button>`).join("")}</div>
    <div class="com-panel"><h2>Fiche prestataire — ${esc(issuerLabel(settingsIssuer))} <small>(numéros ${esc(s.prefix || "")}-…)</small></h2><div class="com-form">
    <div class="com-row">${text("legal_name", "Nom légal")}${text("trade_name", "Nom commercial")}</div>
    <div class="com-row">${text("siren", "SIREN / SIRET")}${text("iban", "IBAN")}</div>
    <div class="com-row">${text("bic", "BIC")}<p class="com-hint">L'IBAN et le BIC sont affichés au client sur la fiche de virement (acompte et solde).</p></div>
    ${text("address", "Adresse")}
    <div class="com-row">${text("postal_code", "Code postal")}${text("city", "Ville")}</div>
    <div class="com-row">${text("email", "E-mail")}${text("phone", "Téléphone")}</div>
    ${text("notify_email", "E-mail qui reçoit les réponses des clients et les notifications")}
    ${area("vat_mention", "Mention TVA")}${area("legal_footer", "Mentions légales (pied de page)")}
    <h3>Valeurs par défaut</h3>
    <div class="com-row3 com-row">${text("default_validity_days", "Validité des devis (jours)")}${text("default_deposit_bps", "Acompte (en 1/100 %, 3000 = 30 %)")}${text("invoice_payment_days", "Délai de paiement (jours)")}</div>
    ${area("default_payment_terms", "Modalités de paiement")}${area("default_cancellation_terms", s.cancellation_heading || "Conditions d'annulation")}
    ${area("default_delivery_terms", s.delivery_heading || "Conditions de livraison")}${area("default_usage_terms", s.usage_heading || "Conditions d'utilisation")}
    <div class="com-actions"><button class="gallery-primary-button" id="set-save" type="button">Enregistrer</button></div></div></div>`;
  bindFields(view, s);
  document.getElementById("set-save").onclick = async () => {
    const out = await run(() => api("save-settings", { issuer: settingsIssuer, settings: s }));
    if (out) say("Réglages enregistrés.", true);
  };
  view.querySelectorAll("[data-set-issuer]").forEach((b) => b.onclick = () => { settingsIssuer = b.dataset.setIssuer; settings(); });
}

// ------------------------------------------------------------ éditeur de devis

let draft = null;
let step = 1;
let catalog = [];
let appSettings = null;
const STEPS = ["Client", "Prestations", "Conditions", "Vérification"];

function newItem(base = {}) {
  return { serviceId: base.id || null, title: base.name || "", description: base.description || "", quantity: "1", unit: base.unit || "forfait", price: toEuros(base.unit_price_cents || 0), vat: String((base.vat_rate_bps ?? 0) / 100), saveToCatalog: false };
}
function itemPayload(item) {
  return { serviceId: item.serviceId, title: item.title, description: item.description, quantity: parseFloat(String(item.quantity).replace(",", ".")) || 0, unit: item.unit, unitPriceCents: toCents(item.price), vatRateBps: Math.round((parseFloat(String(item.vat).replace(",", ".")) || 0) * 100), saveToCatalog: item.saveToCatalog && !item.serviceId };
}
function totalsOf(items) {
  const byRate = new Map();
  let ht = 0;
  for (const raw of items) {
    const it = itemPayload(raw);
    const line = Math.round(it.quantity * it.unitPriceCents);
    ht += line;
    byRate.set(it.vatRateBps, (byRate.get(it.vatRateBps) || 0) + line);
  }
  let vat = 0;
  const breakdown = [...byRate].map(([rate, base]) => { const v = Math.round(base * rate / 10000); vat += v; return { rate, base, vat: v }; });
  return { ht, vat, ttc: ht + vat, breakdown };
}
function depositOf(ttc) {
  return draft.depositEnabled ? Math.round(ttc * (parseFloat(String(draft.depositPct).replace(",", ".")) || 0) / 100) : 0;
}

async function quoteEditor(id, presetClient, preset = {}) {
  view.innerHTML = "<p>Chargement…</p>";
  currentTab = "quotes";
  renderTabs();
  // Prestataire : celui du brouillon existant, sinon celui choisi (Alexandre par défaut)
  let issuer = preset.issuer === "elisa" ? "elisa" : "alexandre";
  let existing = null;
  if (id) {
    existing = await run(() => api("get-quote", { id }));
    if (!existing) return;
    issuer = existing.quote.issuer === "elisa" ? "elisa" : "alexandre";
  }
  const [cat, set] = await Promise.all([run(() => api("list-services", { issuer })), run(() => api("get-settings", { issuer }))]);
  if (!cat || !set) return;
  catalog = cat.services;
  appSettings = set.settings;
  const s = appSettings;
  draft = {
    id: null, client: { ...EMPTY_CLIENT, ...(presetClient || {}) }, items: [],
    validUntil: new Date(Date.now() + (s.default_validity_days || 30) * 86400000).toISOString().slice(0, 10),
    servicePeriod: "", serviceDate: "", serviceTime: "", serviceLocation: "", projectDescription: "", specialConditions: "",
    paymentTerms: s.default_payment_terms || "", cancellationTerms: s.default_cancellation_terms || "",
    deliveryTerms: s.default_delivery_terms || "", usageTerms: s.default_usage_terms || "",
    depositEnabled: true, depositPct: String((s.default_deposit_bps ?? 3000) / 100),
    contactRequestId: null,
    ...preset,
    issuer
  };
  if (id) {
    const data = existing;
    const q = data.quote;
    Object.assign(draft, {
      id: q.id, client: clientFromRow({ id: q.client_id, ...q.client_snapshot, postal_code: q.client_snapshot?.postalCode ?? q.client_snapshot?.postal_code, vat_number: q.client_snapshot?.vatNumber ?? q.client_snapshot?.vat_number }),
      validUntil: q.valid_until || "", servicePeriod: q.service_period,
      serviceDate: q.service_date || "", serviceTime: q.service_time || "", serviceLocation: q.service_location || "", projectDescription: q.project_description,
      specialConditions: q.special_conditions, paymentTerms: q.payment_terms, cancellationTerms: q.cancellation_terms,
      deliveryTerms: q.delivery_terms, usageTerms: q.usage_terms, depositEnabled: q.deposit_enabled !== false,
      depositPct: String((q.deposit_bps ?? 3000) / 100),
      items: q.items.map((i) => ({ serviceId: i.service_id, title: i.title, description: i.description, quantity: String(i.quantity), unit: i.unit, price: toEuros(i.unit_price_cents), vat: String(i.vat_rate_bps / 100), saveToCatalog: false }))
    });
    if (q.client_id && !draft.client.id) draft.client.id = q.client_id;
  }
  step = 1;
  renderEditor();
}

function previewHtml() {
  const t = totalsOf(draft.items);
  const c = draft.client;
  const dep = depositOf(t.ttc);
  return `<h4>Devis</h4>
    <div class="pv-cols"><div><strong>${esc(appSettings.trade_name || appSettings.legal_name)}</strong><br>${esc(appSettings.address)}<br>${esc(`${appSettings.postal_code} ${appSettings.city}`)}</div>
    <div><strong>${esc(c.name) || "Client"}</strong><br>${esc(c.address)}<br>${esc(`${c.postalCode} ${c.city}`.trim())}</div></div>
    <div>Valable jusqu'au ${dateFr(draft.validUntil)}${draft.serviceDate ? ` · Prestation le ${dateFr(draft.serviceDate)}${draft.serviceTime ? ` à ${esc(draft.serviceTime)}` : ""}${draft.serviceLocation ? `, ${esc(draft.serviceLocation)}` : ""}` : ""}${draft.servicePeriod ? ` · ${esc(draft.servicePeriod)}` : ""}</div>
    <table><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">P.U.</th><th class="r">Total</th></tr></thead><tbody>
    ${draft.items.map((i) => { const p = itemPayload(i); return `<tr><td><strong>${esc(i.title)}</strong><br>${esc(i.description)}</td><td class="r">${esc(i.quantity)} ${esc(i.unit)}</td><td class="r">${money(p.unitPriceCents)}</td><td class="r">${money(Math.round(p.quantity * p.unitPriceCents))}</td></tr>`; }).join("")}
    </tbody></table>
    <div class="r">Total HT : ${money(t.ht)}</div>${t.breakdown.map((b) => `<div class="r">TVA ${b.rate / 100} % : ${money(b.vat)}</div>`).join("")}
    <div class="r pv-total">Total TTC : ${money(t.ttc)}</div>
    ${dep ? `<div class="r">Acompte à la commande : ${money(dep)}</div><div class="r">Solde : ${money(t.ttc - dep)}</div>` : ""}
    ${draft.projectDescription ? `<div class="pv-note">${esc(draft.projectDescription)}</div>` : ""}`;
}

function renderEditor() {
  const stepsHtml = `<div class="com-steps">${STEPS.map((l, i) => `<div class="com-step ${i + 1 < step ? "is-done" : ""} ${i + 1 === step ? "is-current" : ""}">${i + 1}. ${l}</div>`).join("")}</div>`;
  view.innerHTML = `<div class="com-top"><h2>${issuerTag(draft.issuer)} ${draft.id ? "Modifier le brouillon" : "Nouveau devis"} — ${esc(issuerLabel(draft.issuer))}</h2>
    <button class="gallery-quiet-button com-preview-toggle" id="pv-toggle" type="button">Aperçu</button></div>
    <div class="com-layout"><div class="com-panel">${stepsHtml}<div class="com-form" id="step-body"></div>
    <div class="com-actions"><button class="gallery-quiet-button" id="prev" type="button" ${step === 1 ? "disabled" : ""}>←︎ Précédent</button>
    ${step < 4 ? '<button class="gallery-primary-button" id="next" type="button">Suivant →︎</button>' : ""}</div></div>
    <aside class="com-preview" id="pv"></aside></div>`;
  const refresh = () => { document.getElementById("pv").innerHTML = previewHtml(); };
  refresh();
  document.getElementById("pv-toggle").onclick = () => document.getElementById("pv").classList.toggle("is-open");
  document.getElementById("prev").onclick = () => { step -= 1; renderEditor(); };
  const next = document.getElementById("next");
  if (next) next.onclick = () => {
    if (step === 1 && !draft.client.name.trim()) return say("Choisissez ou saisissez un client.");
    if (step === 2 && !draft.items.length) return say("Ajoutez au moins une prestation.");
    if (step === 2 && draft.items.some((i) => !i.title.trim())) return say("Chaque prestation doit avoir un titre.");
    say("");
    step += 1;
    renderEditor();
  };
  const body = document.getElementById("step-body");
  [null, stepClient, stepItems, stepTerms, stepReview][step](body, refresh);
}

function stepClient(body, refresh) {
  body.innerHTML = `${field("Rechercher un client existant", '<input class="gallery-admin-input" id="cq" placeholder="Nom ou e-mail">')}<div id="cres"></div><h3>Informations du client</h3>${clientFields(draft.client)}`;
  bindFields(body, draft.client, refresh);
  let timer;
  document.getElementById("cq").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const data = await run(() => api("list-clients", { q: e.target.value }));
      if (!data) return;
      const box = document.getElementById("cres");
      box.innerHTML = data.clients.slice(0, 6).map((c) => `<p><button class="gallery-quiet-button" type="button" data-id="${c.id}">${esc(c.name)} — ${esc(c.email)}</button></p>`).join("");
      box.querySelectorAll("button").forEach((b) => b.onclick = () => {
        draft.client = clientFromRow(data.clients.find((c) => c.id === b.dataset.id));
        renderEditor();
      });
    }, 250);
  });
}

function stepItems(body, refresh) {
  const options = catalog.map((s) => `<option value="${s.id}">${esc(s.name)} — ${money(s.unit_price_cents)}</option>`).join("");
  const draw = () => {
    body.innerHTML = `<div class="com-row">${field("Ajouter depuis le catalogue", `<select class="gallery-admin-input" id="cat"><option value="">Choisir…</option>${options}</select>`)}
      <div class="com-actions"><button class="gallery-quiet-button" id="custom" type="button">+ Prestation personnalisée</button></div></div>
      <div id="items">${draft.items.map((it, n) => `<div class="com-item" data-n="${n}">
        ${field("Titre", input("title", it.title))}${field("Description", textarea("description", it.description))}
        <div class="com-item-grid">${field("Quantité", input("quantity", it.quantity, 'inputmode="decimal"'))}${field("Unité", input("unit", it.unit))}${field("Prix HT (€)", input("price", it.price, 'inputmode="decimal"'))}${field("TVA (%)", input("vat", it.vat, 'inputmode="decimal"'))}</div>
        ${it.serviceId ? "" : `<label class="com-check"><input type="checkbox" data-save ${it.saveToCatalog ? "checked" : ""}> Enregistrer dans mon catalogue</label>`}
        <div class="com-actions"><button class="gallery-quiet-button" type="button" data-del>Retirer</button></div></div>`).join("")}</div>`;
    body.querySelectorAll(".com-item").forEach((box) => {
      const it = draft.items[box.dataset.n];
      bindFields(box, it, refresh);
      box.querySelector("[data-del]").onclick = () => { draft.items.splice(box.dataset.n, 1); draw(); refresh(); };
      const save = box.querySelector("[data-save]");
      if (save) save.onchange = () => { it.saveToCatalog = save.checked; };
    });
    document.getElementById("cat").onchange = (e) => {
      const svc = catalog.find((s) => s.id === e.target.value);
      if (svc) { draft.items.push(newItem(svc)); draw(); refresh(); }
    };
    document.getElementById("custom").onclick = () => { draft.items.push(newItem()); draw(); refresh(); };
  };
  draw();
}

function stepTerms(body, refresh) {
  body.innerHTML = `<div class="com-row">${field("Date de la prestation", input("serviceDate", draft.serviceDate, 'type="date"'))}${field("Heure du rendez-vous", input("serviceTime", draft.serviceTime, 'type="time"'))}</div>
    ${field("Lieu du rendez-vous", input("serviceLocation", draft.serviceLocation, 'placeholder="Adresse ou lieu précis"'))}
    <p class="com-hint">La date, l'heure et le lieu servent aux rappels envoyés au client 72 h et 24 h avant (après ta validation), et à l'échéance de l'acompte (72 h avant).</p>
    <div class="com-row">${field("Valable jusqu'au", input("validUntil", draft.validUntil, 'type="date"'))}${field("Précisions sur la réalisation", input("servicePeriod", draft.servicePeriod, 'placeholder="Durée, plusieurs dates…"'))}</div>
    ${field("Description du projet", textarea("projectDescription", draft.projectDescription))}
    ${field("Conditions particulières", textarea("specialConditions", draft.specialConditions))}
    <div class="com-row"><label class="com-check"><input type="checkbox" id="dep-on" ${draft.depositEnabled ? "checked" : ""}> Demander un acompte</label>${field("Acompte (%)", input("depositPct", draft.depositPct, 'inputmode="decimal"'))}</div>
    ${field("Modalités de paiement", textarea("paymentTerms", draft.paymentTerms))}${field(appSettings.cancellation_heading || "Conditions d'annulation", textarea("cancellationTerms", draft.cancellationTerms))}
    ${field(appSettings.delivery_heading || "Livraison", textarea("deliveryTerms", draft.deliveryTerms))}${field(appSettings.usage_heading || "Utilisation des images", textarea("usageTerms", draft.usageTerms))}`;
  bindFields(body, draft, refresh);
  document.getElementById("dep-on").onchange = (e) => { draft.depositEnabled = e.target.checked; refresh(); };
}

function stepReview(body) {
  const t = totalsOf(draft.items);
  const dep = depositOf(t.ttc);
  body.innerHTML = `<div class="com-detail"><dl><dt>Client</dt><dd>${esc(draft.client.name)}</dd><dt>Prestations</dt><dd>${draft.items.length}</dd>
    <dt>Total HT</dt><dd>${money(t.ht)}</dd><dt>Total TTC</dt><dd>${money(t.ttc)}</dd><dt>Acompte</dt><dd>${dep ? money(dep) : "Aucun"}</dd><dt>Valable jusqu'au</dt><dd>${dateFr(draft.validUntil)}</dd></dl>
    <p>La validation attribue le numéro définitif et génère le PDF. Un devis validé ne peut plus être modifié.</p></div>
    <div class="com-actions"><button class="gallery-quiet-button" id="save-draft" type="button">Enregistrer le brouillon</button>
    <button class="gallery-primary-button" id="validate" type="button">Valider et générer le PDF</button>
    ${draft.id ? '<button class="gallery-quiet-button" id="del-draft" type="button">Supprimer le brouillon</button>' : ""}</div>`;
  const persist = async () => {
    const data = await run(() => api("save-quote", {
      quoteId: draft.id, client: draft.client, items: draft.items.map(itemPayload),
      validUntil: draft.validUntil || null, servicePeriod: draft.servicePeriod,
      serviceDate: draft.serviceDate || null, serviceTime: draft.serviceTime, serviceLocation: draft.serviceLocation, projectDescription: draft.projectDescription,
      specialConditions: draft.specialConditions, paymentTerms: draft.paymentTerms, cancellationTerms: draft.cancellationTerms,
      deliveryTerms: draft.deliveryTerms, usageTerms: draft.usageTerms, depositEnabled: draft.depositEnabled,
      depositBps: Math.round((parseFloat(String(draft.depositPct).replace(",", ".")) || 0) * 100),
      contactRequestId: draft.contactRequestId || undefined,
      issuer: draft.issuer
    }));
    if (data) draft.id = data.quote.id;
    return data;
  };
  document.getElementById("save-draft").onclick = async () => { if (await persist()) { say("Brouillon enregistré.", true); go("quotes"); } };
  document.getElementById("validate").onclick = async (e) => {
    e.target.disabled = true;
    if (await persist()) {
      const done = await run(() => api("validate-quote", { id: draft.id }));
      if (done) { say("Devis validé.", true); return quoteDetail(done.quote.id); }
    }
    e.target.disabled = false;
  };
  const del = document.getElementById("del-draft");
  if (del) del.onclick = async () => {
    if (confirm("Supprimer ce brouillon ?") && await run(() => api("delete-quote", { id: draft.id }))) go("quotes");
  };
}

// ------------------------------------------------------------ documents

async function documentActions(kind, id, defaultEmail) {
  // Téléchargement direct (fichier enregistré sous un nom lisible), sans ouvrir d'onglet
  const open = async (signed = false) => {
    const d = await run(() => api("document-url", { kind, id, days: 1, signed: signed === true }));
    if (!d) return;
    const link = document.createElement("a");
    link.href = d.downloadUrl || d.url;
    link.download = d.fileName || "";
    document.body.append(link);
    link.click();
    link.remove();
  };
  const copy = async () => {
    const d = await run(() => api("document-url", { kind, id, days: 7 }));
    if (!d) return;
    try { await navigator.clipboard.writeText(d.url); say("Lien sécurisé copié (valable 7 jours).", true); } catch { window.prompt("Copiez le lien :", d.url); }
  };
  const send = async () => {
    const to = window.prompt("Envoyer à (e-mail) :", defaultEmail || "");
    if (!to) return;
    const message = window.prompt(kind === "quote" ? "Message (laisser vide pour le message par défaut, avec le bouton « Répondre à la proposition ») :" : "Message (laisser vide pour le message par défaut) :", "") || "";
    if (await run(() => api("send-document", { kind, id, to, message }))) say("E-mail envoyé.", true);
  };
  return { open, openSigned: () => open(true), copy, send };
}

async function quoteDetail(id) {
  currentTab = "quotes";
  renderTabs();
  view.innerHTML = "<p>Chargement…</p>";
  const data = await run(() => api("get-quote", { id }));
  if (!data) return;
  const q = data.quote;
  const c = q.client_snapshot || {};
  const actions = await documentActions("quote", id, c.email);
  view.innerHTML = `<div class="com-panel com-detail"><div class="com-top"><h2>${issuerTag(q.issuer)} Devis ${esc(q.number)} ${badge(QUOTE_STATUS, q.status)}</h2>
    <a class="gallery-quiet-button" href="#" id="back">←︎ Retour</a></div>
    <dl><dt>Client</dt><dd>${esc(c.name)}</dd><dt>Date</dt><dd>${dateFr(q.issue_date)}</dd>
    ${q.service_date ? `<dt>Rendez-vous</dt><dd>${dateFr(q.service_date)}${q.service_time ? ` à ${esc(q.service_time)}` : ""}${q.service_location ? ` — ${esc(q.service_location)}` : ""}</dd>` : ""}
    ${q.online_balance_paid_cents ? `<dt>Payé par carte (à reporter)</dt><dd>${money(q.online_balance_paid_cents)} — reporté automatiquement sur la facture finale à son émission</dd>` : ""}
    ${q.deposit_transfer_notified_at ? `<dt>Virement de l'acompte</dt><dd>signalé par le client le ${dateFr(q.deposit_transfer_notified_at)} — à vérifier, puis à enregistrer sur la facture</dd>` : ""}
    ${q.balance_transfer_notified_at ? `<dt>Virement du solde</dt><dd>signalé par le client le ${dateFr(q.balance_transfer_notified_at)} — à vérifier, puis à enregistrer sur la facture</dd>` : ""}<dt>Valable jusqu'au</dt><dd>${dateFr(q.valid_until)}</dd>
    <dt>Total TTC</dt><dd>${money(q.total_ttc_cents)}</dd><dt>Acompte demandé</dt><dd>${money(data.deposit.requestedCents)}</dd>
    <dt>Acompte facturé</dt><dd>${money(data.deposit.invoicedCents)}</dd><dt>Acompte reçu</dt><dd>${money(data.deposit.receivedCents)}</dd></dl>
    <div class="com-actions"><button class="gallery-primary-button" id="dl" type="button">Télécharger le PDF</button>
    ${q.signed_pdf_path ? '<button class="gallery-primary-button" id="dls" type="button">Télécharger le devis signé</button>' : ""}
    <button class="gallery-quiet-button" id="cp" type="button">Copier le lien</button><button class="gallery-quiet-button" id="sd" type="button">Envoyer par e-mail</button></div>
    ${q.responded_at ? `<h3>Réponse du client</h3><p>${q.status === "accepted" ? (q.signed_at ? "Devis accepté et signé" : "Devis accepté") : "Devis refusé"} en ligne le ${dateFr(q.responded_at.slice(0, 10))}${q.status === "refused" ? (q.response_redo ? " — <strong>souhaite un nouveau devis</strong>" : " — ne demande pas de nouveau devis") : ""}.</p>
      ${q.response_comment ? `<p><em>Commentaire :</em><br>${esc(q.response_comment).replace(/\n/g, "<br>")}</p>` : ""}` : ""}
    <h3>Statut</h3><div class="com-actions">${["sent", "accepted", "refused"].map((s) => `<button class="gallery-quiet-button" type="button" data-st="${s}">Marquer ${QUOTE_STATUS[s][0].toLowerCase()}</button>`).join("")}</div>
    ${q.status === "accepted" ? `<h3>Facturation</h3><div class="com-actions">
      ${data.deposit.requestedCents ? '<button class="gallery-quiet-button" type="button" data-inv="deposit">Créer la facture d\'acompte</button>' : ""}
      <button class="gallery-primary-button" type="button" data-inv="final">Créer la facture finale</button></div>` : ""}
    <h3>Factures liées</h3>${data.invoices.map((i) => `<p><a href="#" data-i="${i.id}">${esc(i.number || "Brouillon")}</a> — ${i.kind === "deposit" ? "Acompte" : "Facture"} ${money(i.total_ttc_cents)} ${badge(INVOICE_STATUS, i.status)}</p>`).join("") || "<p>Aucune.</p>"}</div>`;
  document.getElementById("back").onclick = (e) => { e.preventDefault(); go("quotes"); };
  document.getElementById("dl").onclick = () => actions.open();
  if (q.signed_pdf_path) document.getElementById("dls").onclick = actions.openSigned;
  document.getElementById("cp").onclick = actions.copy;
  document.getElementById("sd").onclick = actions.send;
  view.querySelectorAll("[data-st]").forEach((b) => b.onclick = async () => {
    if (await run(() => api("set-quote-status", { id, status: b.dataset.st }))) quoteDetail(id);
  });
  view.querySelectorAll("[data-inv]").forEach((b) => b.onclick = async () => {
    const out = await run(() => api("invoice-from-quote", { quoteId: id, mode: b.dataset.inv }));
    if (out) invoiceDetail(out.invoice.id);
  });
  view.querySelectorAll("[data-i]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); invoiceDetail(a.dataset.i); }));
}

const METHODS = [["virement", "Virement"], ["carte", "Carte"], ["especes", "Espèces"], ["cheque", "Chèque"], ["autre", "Autre"]];

async function invoiceDetail(id) {
  currentTab = "invoices";
  renderTabs();
  view.innerHTML = "<p>Chargement…</p>";
  const data = await run(() => api("get-invoice", { id }));
  if (!data) return;
  const i = data.invoice;
  const c = i.client_snapshot || {};
  const issued = Boolean(i.number);
  const remaining = i.amount_due_cents - i.paid_cents;
  const actions = issued ? await documentActions("invoice", id, c.email) : null;
  view.innerHTML = `<div class="com-panel com-detail"><div class="com-top"><h2>${issuerTag(i.issuer)} ${i.kind === "deposit" ? "Facture d'acompte" : "Facture"} ${esc(i.number || "(brouillon)")} ${badge(INVOICE_STATUS, i.status)}</h2>
    <a class="gallery-quiet-button" href="#" id="back">←︎ Retour</a></div>
    <dl><dt>Client</dt><dd>${esc(c.name || "—")}</dd><dt>Devis</dt><dd>${esc(i.quote_number || "—")}</dd><dt>Échéance</dt><dd>${dateFr(i.due_date)}</dd>
    <dt>Total TTC</dt><dd>${money(i.total_ttc_cents)}</dd><dt>Reste à payer</dt><dd>${money(issued ? remaining : i.amount_due_cents)}</dd></dl>
    <div class="com-table-wrap"><table class="com-table"><thead><tr><th>Désignation</th><th class="com-num">Qté</th><th class="com-num">Total HT</th></tr></thead><tbody>
    ${i.items.map((it) => `<tr><td>${esc(it.title)}</td><td class="com-num">${esc(it.quantity)} ${esc(it.unit)}</td><td class="com-num">${money(it.total_ht_cents)}</td></tr>`).join("")}</tbody></table></div>
    ${issued ? `<div class="com-actions"><button class="gallery-primary-button" id="dl" type="button">Télécharger le PDF</button>
      <button class="gallery-quiet-button" id="cp" type="button">Copier le lien</button><button class="gallery-quiet-button" id="sd" type="button">Envoyer par e-mail</button></div>
      <h3>Paiements</h3>${i.payments.map((p) => `<p>${dateFr(p.paid_on)} — ${money(p.amount_cents)} (${esc(p.method)}) ${esc(p.reference || "")}</p>`).join("") || "<p>Aucun paiement.</p>"}
      ${remaining > 0 && i.status !== "cancelled" ? `<div class="com-form" id="pay"><div class="com-row3 com-row">${field("Date", input("paidOn", today(), 'type="date"'))}${field("Montant (€)", input("amount", toEuros(remaining), 'inputmode="decimal"'))}
        ${field("Moyen", `<select class="gallery-admin-input" data-k="method">${METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`)}</div>
        <div class="com-row">${field("Référence", input("reference", ""))}${field("Commentaire", input("comment", ""))}</div>
        <div class="com-actions"><button class="gallery-primary-button" id="pay-btn" type="button">Enregistrer le paiement</button></div></div>` : ""}`
      : `<p>Brouillon : l'émission attribue le numéro et génère le PDF.</p><div class="com-actions"><button class="gallery-primary-button" id="issue" type="button">Émettre la facture</button><button class="gallery-quiet-button" id="del" type="button">Supprimer le brouillon</button></div>`}</div>`;
  document.getElementById("back").onclick = (e) => { e.preventDefault(); go("invoices"); };
  if (issued) {
    document.getElementById("dl").onclick = actions.open;
    document.getElementById("cp").onclick = actions.copy;
    document.getElementById("sd").onclick = actions.send;
    const pay = document.getElementById("pay");
    if (pay) {
      const form = { paidOn: today(), amount: toEuros(remaining), method: "virement", reference: "", comment: "" };
      bindFields(pay, form);
      document.getElementById("pay-btn").onclick = async () => {
        const out = await run(() => api("add-payment", { invoiceId: id, paidOn: form.paidOn, amountCents: toCents(form.amount), method: form.method, reference: form.reference, comment: form.comment }));
        if (out) { say("Paiement enregistré.", true); invoiceDetail(id); }
      };
    }
  } else {
    document.getElementById("issue").onclick = async (e) => {
      e.target.disabled = true;
      const out = await run(() => api("issue-invoice", { id }));
      if (out) { say("Facture émise.", true); invoiceDetail(id); } else e.target.disabled = false;
    };
    document.getElementById("del").onclick = async () => {
      if (confirm("Supprimer ce brouillon ?") && await run(() => api("delete-invoice", { id }))) go("invoices");
    };
  }
}

// Liens directs depuis le centre de notifications : #devis=…, #brouillon=…, #facture=…, #demande=…
async function openFromHash() {
  const [key, id] = window.location.hash.slice(1).split("=");
  history.replaceState(null, "", window.location.pathname);
  if (key === "devis" && id) return quoteDetail(id);
  if (key === "brouillon" && id) return quoteEditor(id);
  if (key === "facture" && id) return invoiceDetail(id);
  if (key === "demande" && id) {
    // Nouveau devis pré-rempli à partir d'une demande du formulaire du site
    const data = await run(() => api("get-contact-request", { id }));
    if (!data) return go("dashboard");
    const r = data.request;
    const client = data.client
      ? clientFromRow(data.client)
      : { name: r.name, email: r.email, phone: r.phone };
    const project = [r.service, r.type].filter(Boolean).join(" — ");
    return quoteEditor(null, client, {
      // Demande « Sites internet » → devis d'Elisa ; sinon devis d'Alexandre
      issuer: /site/i.test(r.service || "") ? "elisa" : "alexandre",
      contactRequestId: r.id,
      serviceDate: r.wanted_date || "",
      servicePeriod: r.wanted_date ? "" : (r.date_text || ""),
      projectDescription: [project, r.message].filter(Boolean).join("\n\n")
    });
  }
  go("dashboard");
}

if (token) openFromHash();
