import { getConfig } from "/galeries-config.js?v=2";

// Application mobile d'administration (PWA).
// Elle n'a ni base ni règle d'accès propres : chaque action passe par les mêmes fonctions serveur
// que l'administration sur ordinateur (commerce-api, admin-api), qui vérifient à chaque appel
// que le compte connecté est bien administrateur. Tout est donc synchronisé avec le site.

const cfg = getConfig();
const BASE = cfg.supabaseUrl.replace(/\/$/, "");
const SESSION_KEY = "app-admin-session";
const CACHE_PREFIX = "app-cache:";
const DESKTOP_TOKEN = "gallery-admin-access-token"; // clé utilisée par les pages d'administration du site
const INSTALL_SEEN = "app-install-help-seen";

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (cents) => `${((cents || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (s) => new Date(`${s}T12:00:00`);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => iso(new Date());
const dayLabel = (s, opts = { weekday: "long", day: "numeric", month: "long" }) => parseDay(s).toLocaleDateString("fr-FR", opts);
const shortDate = (s) => (s ? parseDay(String(s).slice(0, 10)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const timeOf = (t) => (t ? String(t).slice(0, 5).replace(":", " h ") : "");
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

class OfflineError extends Error {
  constructor() { super("Pas de connexion internet."); }
}

// ================================================================ session

let session = readJson(SESSION_KEY);
let refreshing = null;

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function writeJson(key, value) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

async function authRequest(grant, body) {
  let response;
  try {
    response = await fetch(`${BASE}/auth/v1/token?grant_type=${grant}`, {
      method: "POST",
      headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    throw new OfflineError();
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    const error = new Error(result.msg || result.error_description || result.message || "Connexion refusée.");
    error.auth = true;
    throw error;
  }
  return result;
}

function storeAuth(result) {
  session = {
    access: result.access_token,
    refresh: result.refresh_token,
    expires: Date.now() + (Number(result.expires_in) || 3600) * 1000,
    email: result.user?.email ?? session?.email ?? ""
  };
  writeJson(SESSION_KEY, session);
}

// Jeton valide (renouvelé automatiquement avec le jeton de rafraîchissement de Supabase Auth)
async function accessToken(force = false) {
  if (!session) throw new Error("Session expirée.");
  if (!force && session.expires - Date.now() > 60_000) return session.access;
  refreshing ||= authRequest("refresh_token", { refresh_token: session.refresh })
    .then(storeAuth)
    .finally(() => { refreshing = null; });
  try {
    await refreshing;
  } catch (error) {
    if (error instanceof OfflineError) throw error;
    logout("Session expirée : reconnectez-vous.");
    throw error;
  }
  return session.access;
}

async function call(fn, { method = "POST", body } = {}, retry = true) {
  if (!navigator.onLine) throw new OfflineError();
  const token = await accessToken();
  let response;
  try {
    response = await fetch(`${BASE}/functions/v1/${fn}`, {
      method,
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new OfflineError();
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && retry) {
    await accessToken(true);
    return call(fn, { method, body }, false);
  }
  if (response.status === 401) {
    logout(data.message || "Session expirée : reconnectez-vous.");
    throw new Error(data.message || "Session expirée.");
  }
  if (!response.ok) throw new Error(data.message || "Une erreur est survenue.");
  return data;
}

const api = (action, body = {}) => call("commerce-api", { body: { action, ...body } });

// ================================================================ cache hors connexion

let staleSince = null;

function clearCache() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* rien */ }
}

// Charge des données ; sans connexion, affiche la dernière version gardée sur l'appareil.
async function load(key, loader) {
  try {
    const data = await loader();
    writeJson(CACHE_PREFIX + key, { at: Date.now(), data });
    return data;
  } catch (error) {
    const cached = error instanceof OfflineError ? readJson(CACHE_PREFIX + key) : null;
    if (!cached) throw error;
    staleSince = staleSince ? Math.min(staleSince, cached.at) : cached.at;
    return cached.data;
  }
}

function updateStatus() {
  const box = $("status");
  if (staleSince) {
    const when = new Date(staleSince).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    box.textContent = `Hors connexion — données enregistrées le ${when}. Les modifications sont désactivées.`;
    box.hidden = false;
  } else if (!navigator.onLine) {
    box.textContent = "Hors connexion — les modifications sont désactivées.";
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

function needOnline() {
  if (!navigator.onLine) throw new Error("Pas de connexion : cette action est impossible hors ligne.");
}

// ================================================================ interface commune

let toastTimer;
function toast(text) {
  const el = $("toast");
  // Au-dessus d'une feuille ouverte (couche supérieure), sinon dans la page
  const host = sheet.open ? sheet : document.body;
  if (el.parentElement !== host) host.append(el);
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

async function guarded(button, task) {
  if (button) button.disabled = true;
  try {
    return await task();
  } catch (error) {
    toast(error.message);
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}

const sheet = $("sheet");
function openSheet(html) {
  $("sheet-body").innerHTML = html;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
  return $("sheet-body");
}
function closeSheet() { if (sheet.open) sheet.close(); }
$("sheet-close").addEventListener("click", closeSheet);
sheet.addEventListener("click", (event) => { if (event.target === sheet) closeSheet(); });

// Pages complètes de l'administration (création de devis, envoi de photos…) : le jeton est transmis
// pour l'onglet en cours seulement, comme après une connexion sur ordinateur.
async function openDesktop(path) {
  try {
    const token = await accessToken();
    sessionStorage.setItem(DESKTOP_TOKEN, token);
  } catch { /* la page demandera de se connecter */ }
  window.location.href = path;
}

// Seules pages ouvertes dans l'application (administration) ; le site public s'ouvre dans Safari
const ADMIN_PAGES = /^\/(admin(\.html)?|gestion-commerciale(\.html)?|admin-galeries(\.html)?)$/;

// PDF : le lien signé est ouvert dans un nouvel onglet (sans quitter l'application)
async function openPdf(button, params) {
  await guarded(button, async () => {
    needOnline();
    const doc = await api("document-url", { days: 1, ...params });
    const opened = window.open(doc.url, "_blank", "noopener");
    if (!opened) {
      button.insertAdjacentHTML("afterend", `<a class="app-button-ghost" href="${esc(doc.url)}" target="_blank" rel="noopener">Ouvrir ${esc(doc.fileName || "le PDF")}</a>`);
    }
  });
}

async function sendDocument(button, kind, id, email) {
  const to = window.prompt("Envoyer à (e-mail du client) :", email || "");
  if (!to) return;
  const message = window.prompt("Message (laisser vide pour le message par défaut) :", "") || "";
  const done = await guarded(button, async () => {
    needOnline();
    return await api("send-document", { kind, id, to, message });
  });
  if (done) toast("Document envoyé.");
}

const QUOTE_STATUS = { draft: ["Brouillon", ""], sent: ["Envoyé", "warn"], accepted: ["Accepté", "ok"], refused: ["Refusé", "bad"], expired: ["Expiré", "bad"] };
const INVOICE_STATUS = { draft: ["Brouillon", ""], issued: ["Émise", "warn"], partially_paid: ["Partiellement payée", "warn"], paid: ["Payée", "ok"], overdue: ["En retard", "bad"], cancelled: ["Annulée", "bad"] };
const ISSUER = { alexandre: "Alex", elisa: "Elisa" };
const pill = (map, status) => { const [label, tone] = map[status] ?? [status, ""]; return `<span class="app-pill${tone ? ` is-${tone}` : ""}">${esc(label)}</span>`; };
const tone = (map, status) => (map[status]?.[1] ? ` is-${map[status][1]}` : "");

// ================================================================ navigation

const TABS = {
  accueil: { title: "Accueil", render: renderHome, fab: homeFab },
  planning: { title: "Planning", render: renderPlanning, fab: () => eventSheet({ date: plan.selected }) },
  afaire: { title: "À faire", render: renderTodo, fab: null },
  espace: { title: "Espace client", render: renderSpaces, fab: () => openDesktop("/admin-galeries.html") },
  gestion: { title: "Gestion", render: renderManagement, fab: newQuoteSheet }
};
let current = "accueil";
let renderId = 0;

function route() {
  const tab = window.location.hash.slice(1).split("/")[0];
  current = TABS[tab] ? tab : "accueil";
  document.querySelectorAll(".app-tabs a").forEach((a) => a.classList.toggle("is-active", a.dataset.tab === current));
  $("top-title").textContent = TABS[current].title;
  $("top-eyebrow").textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  $("fab").hidden = !TABS[current].fab;
  closeSheet();
  render();
}

async function render() {
  const id = ++renderId;
  const view = $("view");
  staleSince = null;
  if (!view.children.length || view.dataset.tab !== current) view.innerHTML = `<p class="app-loading">Chargement…</p>`;
  view.dataset.tab = current;
  $("refresh").classList.add("is-spinning");
  try {
    const html = await TABS[current].render();
    if (id !== renderId) return;
    if (typeof html === "string") view.innerHTML = html;
    TABS[current].bind?.(view);
  } catch (error) {
    if (id !== renderId) return;
    view.innerHTML = `<p class="app-empty">${esc(error.message)}</p>`;
  } finally {
    if (id === renderId) {
      $("refresh").classList.remove("is-spinning");
      updateStatus();
    }
  }
}

$("fab").addEventListener("click", () => TABS[current].fab?.());
$("refresh").addEventListener("click", render);
$("menu").addEventListener("click", menuSheet);
window.addEventListener("hashchange", route);
window.addEventListener("online", () => { updateStatus(); render(); });
window.addEventListener("offline", updateStatus);
window.addEventListener("scroll", () => document.querySelector(".app-top")?.classList.toggle("is-scrolled", window.scrollY > 4), { passive: true });

// Retour dans l'application après un moment : données actualisées
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (session && hiddenAt && Date.now() - hiddenAt > 60_000) render();
});

// ================================================================ notifications (À faire)

const CATEGORY = { galerie: "Galerie", demande: "Demande", devis: "Devis", facture: "Facture", rappel: "Rappel" };
const FILTERS = [["all", "Tout"], ["urgent", "Prioritaires"], ["demande", "Demandes"], ["devis", "Devis"], ["facture", "Factures"], ["galerie", "Galeries"], ["rappel", "Rappels"]];
let notes = [];
let noteFilter = "all";

async function loadNotes() {
  const data = await load("notifications", () => api("notifications"));
  notes = data.notifications ?? [];
  const badge = $("badge");
  badge.textContent = notes.length > 99 ? "99+" : String(notes.length);
  badge.hidden = !notes.length;
  return notes;
}

function countdown(deadline) {
  const ms = Date.parse(deadline) - Date.now();
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const text = days ? `${days} j ${hours} h` : hours ? `${hours} h ${String(minutes).padStart(2, "0")} min` : `${minutes} min`;
  return ms >= 0 ? { text: `${text} restantes`, late: false } : { text: `en retard de ${text}`, late: true };
}

function noteHtml(n) {
  const timer = n.deadline ? countdown(n.deadline) : null;
  return `<li class="notif notif-${esc(n.level)}" data-key="${esc(n.key)}">
    <div class="notif-body">
      <p class="notif-head"><span class="notif-chip">${CATEGORY[n.category] ?? ""}</span>
        ${timer ? `<span class="notif-timer${timer.late ? " is-late" : ""}">${esc(timer.text)}</span>` : ""}</p>
      <button type="button" class="notif-title" data-open="${esc(n.key)}">${esc(n.title)}</button>
      <p class="notif-detail">${esc(n.detail)}</p>
      ${n.actions?.length ? `<div class="notif-actions">${n.actions.map((a, i) => `<button type="button" class="notif-action" data-act="${esc(n.key)}" data-index="${i}">${esc(a.label)}</button>`).join("")}</div>` : ""}
    </div>
    <button type="button" class="notif-close" data-dismiss="${esc(n.key)}" aria-label="Supprimer la notification">×</button>
  </li>`;
}

function bindNotes(root) {
  root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openNote(b.dataset.open)));
  root.querySelectorAll("[data-dismiss]").forEach((b) => b.addEventListener("click", () => dismissNote(b)));
  root.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => noteAction(b)));
}

// Les liens des notifications visent les pages du site : devis et factures s'ouvrent dans l'application.
function openLink(link) {
  if (!link) return;
  const hash = link.split("#")[1] ?? "";
  const [kind, id] = hash.split("=");
  if (kind === "devis" && id) return quoteSheet(id);
  if (kind === "facture" && id) return invoiceSheet(id);
  const url = new URL(link, `${window.location.origin}/`);
  // L'application ne contient que l'administration : toute autre page s'ouvre dans Safari
  if (url.origin !== window.location.origin || !ADMIN_PAGES.test(url.pathname)) return window.open(url.href, "_blank", "noopener");
  return openDesktop(url.pathname + url.hash);
}

function openNote(key) {
  const note = notes.find((n) => n.key === key);
  if (!note) return;
  if (note.contactRequestId) return requestSheet(note.contactRequestId, note.key);
  openLink(note.link);
}

async function dismissNote(button) {
  const key = button.dataset.dismiss;
  const item = button.closest(".notif");
  item?.classList.add("is-leaving");
  const ok = await guarded(button, async () => { needOnline(); return await api("dismiss-notification", { key }); });
  if (!ok) { item?.classList.remove("is-leaving"); return; }
  notes = notes.filter((n) => n.key !== key);
  writeJson(CACHE_PREFIX + "notifications", { at: Date.now(), data: { notifications: notes } });
  render();
}

async function noteAction(button) {
  const note = notes.find((n) => n.key === button.dataset.act);
  const action = note?.actions?.[Number(button.dataset.index)];
  if (!action) return;
  if (action.action === "download-quote") return openPdf(button, { kind: "quote", id: action.quoteId });
  if (action.action === "send-quote") {
    await sendDocument(button, "quote", action.quoteId, action.email);
    render();
  }
}

async function renderTodo() {
  await loadNotes();
  const list = noteFilter === "all" ? notes
    : noteFilter === "urgent" ? notes.filter((n) => n.level === "urgent" || n.level === "important")
      : notes.filter((n) => n.category === noteFilter);
  const count = (key) => key === "all" ? notes.length : key === "urgent"
    ? notes.filter((n) => n.level === "urgent" || n.level === "important").length
    : notes.filter((n) => n.category === key).length;
  return `<div class="app-chips" role="group" aria-label="Filtrer">${FILTERS.map(([key, label]) =>
    `<button type="button" class="notif-filter${noteFilter === key ? " is-active" : ""}" data-filter="${key}">${label}${count(key) ? ` <span>${count(key)}</span>` : ""}</button>`).join("")}</div>
    <ul class="notif-list app-section">${list.length ? list.map(noteHtml).join("") : `<li class="notif-empty">${notes.length ? "Rien dans cette catégorie." : "Aucune notification : tout est à jour."}</li>`}</ul>`;
}
TABS.afaire.bind = (root) => {
  root.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { noteFilter = b.dataset.filter; render(); }));
  bindNotes(root);
};

// Demande reçue par le formulaire du site
async function requestSheet(id, noteKey) {
  const body = openSheet(`<p class="app-loading">Chargement…</p>`);
  try {
    const { request: r } = await load(`request:${id}`, () => api("get-contact-request", { id }));
    openSheet(`<p class="app-eyebrow">Demande · ${esc(shortDate(r.created_at))}</p>
      <h2>${esc(r.name || r.email || "Demande")}</h2>
      <dl class="app-facts">
        ${r.email ? `<dt>E-mail</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd>` : ""}
        ${r.phone ? `<dt>Téléphone</dt><dd><a href="tel:${esc(r.phone.replace(/\s/g, ""))}">${esc(r.phone)}</a></dd>` : ""}
        ${r.service ? `<dt>Prestation</dt><dd>${esc([r.service, r.type].filter(Boolean).join(" · "))}</dd>` : ""}
        ${r.date_text || r.wanted_date ? `<dt>Date souhaitée</dt><dd>${esc(r.date_text || shortDate(r.wanted_date))}</dd>` : ""}
      </dl>
      ${r.message ? `<h3>Message</h3><p class="app-message">${esc(r.message)}</p>` : ""}
      ${r.notes ? `<p class="app-hint">${esc(r.notes)}</p>` : ""}
      <div class="app-actions">
        <button class="app-button" type="button" id="req-quote">Créer le devis</button>
        <button class="app-button-ghost" type="button" id="req-dismiss">Ignorer cette demande</button>
      </div>`);
    $("req-quote").onclick = () => openDesktop(`/gestion-commerciale.html#demande=${encodeURIComponent(id)}`);
    $("req-dismiss").onclick = async (event) => {
      if (!window.confirm("Ignorer cette demande ? Elle disparaîtra du centre de notifications.")) return;
      const ok = await guarded(event.currentTarget, async () => { needOnline(); return await api("dismiss-contact-request", { id }); });
      if (ok) { closeSheet(); toast("Demande ignorée."); render(); }
    };
  } catch (error) {
    body.innerHTML = `<p class="app-empty">${esc(error.message)}</p>`;
  }
  void noteKey;
}

// ================================================================ accueil

async function renderHome() {
  const from = today();
  const to = iso(addDays(new Date(), 14));
  const [, planning, alex, elisa] = await Promise.all([
    loadNotes().catch(() => []),
    load(`planning:${from}:${to}`, () => api("planning", { from, to })).catch(() => ({ entries: [] })),
    load("dashboard:alexandre", () => api("dashboard", { issuer: "alexandre" })).catch(() => null),
    load("dashboard:elisa", () => api("dashboard", { issuer: "elisa" })).catch(() => null)
  ]);
  const entries = planning.entries ?? [];
  const sessions = entries.filter((e) => e.status === "confirmed").length;
  const priority = notes.filter((n) => n.level === "urgent" || n.level === "important");
  const top = (priority.length ? priority : notes).slice(0, 3);
  const sum = (key) => (alex?.[key] ?? 0) + (elisa?.[key] ?? 0);
  const pushInvite = pushSupported() && isStandalone() && Notification.permission === "default"
    ? `<button type="button" class="app-row is-warn" id="push-invite" style="margin-bottom:12px"><b>Recevoir les rappels sur l'iPhone ?</b><small>Rendez-vous, échéances, nouvelles demandes : découvrir les notifications</small></button>` : "";
  return `${pushInvite}<div class="app-tiles">
      <a class="app-tile" href="#afaire"><strong>${notes.length}</strong><span>à faire${priority.length ? ` · ${priority.length} prioritaire${priority.length > 1 ? "s" : ""}` : ""}</span></a>
      <a class="app-tile" href="#planning"><strong>${sessions}</strong><span>séance${sessions > 1 ? "s" : ""} confirmée${sessions > 1 ? "s" : ""} sous 15 jours</span></a>
      <a class="app-tile" href="#gestion"><strong>${alex || elisa ? sum("quotesPending") : "—"}</strong><span>devis en attente de réponse</span></a>
      <a class="app-tile" href="#gestion/factures"><strong>${alex || elisa ? money(sum("remainingCents")).replace(",00", "") : "—"}</strong><span>reste à encaisser</span></a>
    </div>
    <section class="app-section">
      <div class="app-section-head"><h2>Prioritaire</h2><a href="#afaire">Tout voir</a></div>
      <ul class="notif-list">${top.length ? top.map(noteHtml).join("") : `<li class="notif-empty">Tout est à jour.</li>`}</ul>
    </section>
    <section class="app-section">
      <div class="app-section-head"><h2>Prochains rendez-vous</h2><a href="#planning">Planning</a></div>
      ${entries.length ? `<ul class="app-list">${entries.slice(0, 6).map(entryHtml).join("")}</ul>` : `<p class="app-empty">Rien de prévu dans les 15 prochains jours.</p>`}
    </section>
    <section class="app-section">
      <div class="app-section-head"><h2>Raccourcis</h2></div>
      <div class="app-actions is-row">
        <button class="app-button-ghost" type="button" data-quick="event">Nouvel événement</button>
        <button class="app-button-ghost" type="button" data-quick="quote">Créer un devis</button>
        <button class="app-button-ghost" type="button" data-quick="clients">Clients</button>
        <button class="app-button-ghost" type="button" data-quick="spaces">Espace client</button>
      </div>
    </section>`;
}
TABS.accueil.bind = (root) => {
  $("push-invite")?.addEventListener("click", notificationsSheet);
  bindNotes(root);
  bindEntries(root);
  root.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => {
    const q = b.dataset.quick;
    if (q === "event") eventSheet({ date: today() });
    if (q === "quote") newQuoteSheet();
    if (q === "clients") window.location.hash = "gestion/clients";
    if (q === "spaces") window.location.hash = "espace";
  }));
};

function homeFab() {
  openSheet(`<h2>Créer</h2><div class="app-actions">
    <button class="app-button" type="button" data-new="event">Nouvel événement au planning</button>
    <button class="app-button-ghost" type="button" data-new="quote">Nouveau devis</button>
    <button class="app-button-ghost" type="button" data-new="space">Nouvel espace client</button></div>`);
  $("sheet-body").querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.new === "event") eventSheet({ date: today() });
    if (b.dataset.new === "quote") newQuoteSheet();
    if (b.dataset.new === "space") openDesktop("/admin-galeries.html");
  }));
}

function newQuoteSheet() {
  openSheet(`<h2>Nouveau devis</h2>
    <p class="app-hint">La création d'un devis (catalogue, lignes, conditions, aperçu PDF) s'ouvre dans la gestion commerciale complète, adaptée au téléphone. Vous revenez ensuite avec le bouton « Application ».</p>
    <div class="app-actions">
      <button class="app-button" type="button" data-q="alexandre">Devis — Alex</button>
      <button class="app-button" type="button" data-q="elisa">Devis — Elisa</button>
      <button class="app-button-ghost" type="button" data-q="reseaux">Devis — Contenus réseaux (à deux)</button>
      <button class="app-button-ghost" type="button" data-q="site">Devis — Site internet (à deux)</button>
    </div>`);
  $("sheet-body").querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => openDesktop(`/gestion-commerciale.html#nouveau=${b.dataset.q}`)));
}

// ================================================================ planning

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYNAMES = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const plan = { view: "mois", cursor: today(), selected: today(), filter: "all", entries: [] };
const STATUS_LABEL = { confirmed: "Confirmé", pending: "En attente", other: "Autre" };
const SOURCE_LABEL = { devis: "Devis", demande: "Demande", manuel: "Planning" };

function entryHtml(e) {
  return `<li><button type="button" class="app-row is-${esc(e.status)}" data-entry="${esc(e.source)}:${esc(e.id)}">
    <b>${esc(e.title)}</b>
    <span class="app-amount"><span class="app-pill">${SOURCE_LABEL[e.source] ?? ""}</span></span>
    <small>${esc(dayLabel(e.date, { weekday: "short", day: "numeric", month: "short" }))}${e.time ? ` · ${esc(timeOf(e.time))}` : ""}${e.location ? ` · ${esc(e.location)}` : ""}</small>
  </button></li>`;
}

function bindEntries(root, entries = null) {
  root.querySelectorAll("[data-entry]").forEach((b) => b.addEventListener("click", () => {
    const [source, id] = b.dataset.entry.split(":");
    if (source === "devis") return quoteSheet(id);
    if (source === "demande") return requestSheet(id);
    const list = entries ?? plan.entries;
    const entry = list.find((e) => e.source === "manuel" && e.id === id) ?? null;
    eventSheet(entry ? { id, date: entry.date, time: entry.time, title: entry.title, location: entry.location, kind: entry.kind, note: entry.note } : { id });
  }));
}

function weekStart(dateStr) {
  const d = parseDay(dateStr);
  return addDays(d, -((d.getDay() + 6) % 7));
}

function rangeFor() {
  const c = parseDay(plan.cursor);
  if (plan.view === "jour") return [plan.cursor, plan.cursor];
  if (plan.view === "semaine") { const s = weekStart(plan.cursor); return [iso(s), iso(addDays(s, 6))]; }
  const first = new Date(c.getFullYear(), c.getMonth(), 1, 12);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return [iso(start), iso(addDays(start, 41))];
}

function filtered(list) {
  return plan.filter === "all" ? list : list.filter((e) => e.status === plan.filter);
}

async function renderPlanning() {
  const [from, to] = rangeFor();
  const data = await load(`planning:${from}:${to}`, () => api("planning", { from, to }));
  plan.entries = data.entries ?? [];
  const entries = filtered(plan.entries);
  const byDay = (day) => entries.filter((e) => e.date === day);
  const c = parseDay(plan.cursor);
  let title = "";
  let body = "";
  if (plan.view === "mois") {
    title = `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
    const start = parseDay(from);
    const cells = Array.from({ length: 42 }, (_, i) => iso(addDays(start, i)));
    body = `<div class="app-month">${DAYNAMES.map((d) => `<span class="app-dayname">${d}</span>`).join("")}
      ${cells.map((day) => {
        const list = byDay(day);
        const classes = ["app-day", parseDay(day).getMonth() !== c.getMonth() ? "is-outside" : "", day === today() ? "is-today" : "", day === plan.selected ? "is-selected" : ""].filter(Boolean).join(" ");
        return `<button type="button" class="${classes}" data-day="${day}" aria-label="${esc(dayLabel(day))}${list.length ? `, ${list.length} élément${list.length > 1 ? "s" : ""}` : ""}">
          <span>${parseDay(day).getDate()}</span><span class="app-dots">${list.slice(0, 3).map((e) => `<i class="is-${esc(e.status)}"></i>`).join("")}</span></button>`;
      }).join("")}</div>
      <section class="app-section"><div class="app-section-head"><h2>${esc(dayLabel(plan.selected))}</h2><button type="button" data-add="${plan.selected}">Ajouter</button></div>
      ${byDay(plan.selected).length ? `<ul class="app-list">${byDay(plan.selected).map(entryHtml).join("")}</ul>` : `<p class="app-empty">Rien ce jour-là.</p>`}</section>`;
  } else if (plan.view === "semaine") {
    const s = parseDay(from);
    title = `Semaine du ${s.getDate()} ${MONTHS[s.getMonth()]}`;
    body = Array.from({ length: 7 }, (_, i) => iso(addDays(s, i))).map((day) => `<div class="app-week-day${day === today() ? " is-today" : ""}">
      <h3>${esc(dayLabel(day, { weekday: "long", day: "numeric" }))}</h3>
      ${byDay(day).length ? `<ul class="app-list">${byDay(day).map(entryHtml).join("")}</ul>` : `<button type="button" class="app-empty" style="width:100%" data-add="${day}">Rien — ajouter</button>`}</div>`).join("");
  } else {
    title = dayLabel(plan.cursor, { weekday: "long", day: "numeric", month: "long" });
    body = byDay(plan.cursor).length ? `<ul class="app-list app-section">${byDay(plan.cursor).map(entryHtml).join("")}</ul>` : `<p class="app-empty app-section">Rien ce jour-là.</p>`;
  }
  return `<div class="app-segment" role="tablist">${["jour", "semaine", "mois"].map((v) => `<button type="button" role="tab" aria-selected="${plan.view === v}" class="${plan.view === v ? "is-active" : ""}" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div>
    <div class="app-chips" role="group" aria-label="Filtrer">${[["all", "Tout"], ["confirmed", "Confirmés"], ["pending", "En attente"], ["other", "Autres"]].map(([k, l]) => `<button type="button" class="notif-filter${plan.filter === k ? " is-active" : ""}" data-pfilter="${k}">${l}</button>`).join("")}</div>
    <div class="app-cal-nav"><button type="button" data-move="-1" aria-label="Précédent">‹</button><strong>${esc(title)}</strong><button type="button" data-move="1" aria-label="Suivant">›</button></div>
    ${body}
    <p class="app-legend"><span><i class="is-confirmed"></i>Confirmé</span><span><i class="is-pending"></i>En attente (devis, option, demande)</span><span><i class="is-other"></i>Autre</span></p>`;
}
TABS.planning.bind = (root) => {
  root.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { plan.view = b.dataset.view; plan.cursor = plan.selected; render(); }));
  root.querySelectorAll("[data-pfilter]").forEach((b) => b.addEventListener("click", () => { plan.filter = b.dataset.pfilter; render(); }));
  root.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
    const step = Number(b.dataset.move);
    const c = parseDay(plan.cursor);
    if (plan.view === "mois") c.setMonth(c.getMonth() + step, 1);
    else c.setDate(c.getDate() + step * (plan.view === "semaine" ? 7 : 1));
    plan.cursor = iso(c);
    if (plan.view !== "mois") plan.selected = plan.cursor;
    render();
  }));
  root.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { plan.selected = b.dataset.day; render(); }));
  root.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => eventSheet({ date: b.dataset.add })));
  bindEntries(root);
};

function eventSheet(event = {}) {
  const e = { date: today(), time: "", title: "", location: "", kind: "seance", note: "", ...event };
  openSheet(`<h2>${e.id ? "Modifier l'événement" : "Nouvel événement"}</h2>
    <form class="app-form" id="event-form" style="width:100%" novalidate>
      <label class="app-field"><span>Titre *</span><input name="title" maxlength="200" value="${esc(e.title)}" required></label>
      <div class="app-two">
        <label class="app-field"><span>Date *</span><input name="date" type="date" value="${esc(e.date)}" required></label>
        <label class="app-field"><span>Heure</span><input name="time" type="time" value="${esc(String(e.time || "").slice(0, 5))}"></label>
      </div>
      <label class="app-field"><span>Lieu</span><input name="location" maxlength="300" value="${esc(e.location)}"></label>
      <fieldset class="app-radio"><legend>Type</legend>
        ${[["seance", "Séance confirmée"], ["option", "Option"], ["autre", "Autre"]].map(([k, l]) => `<label><input type="radio" name="kind" value="${k}" ${e.kind === k ? "checked" : ""}><span>${l}</span></label>`).join("")}
      </fieldset>
      <label class="app-field"><span>Note</span><textarea name="note" maxlength="2000">${esc(e.note)}</textarea></label>
      <div class="app-actions">
        <button class="app-button" type="submit">Enregistrer</button>
        ${e.id ? `<button class="app-button-danger" type="button" id="event-delete">Supprimer</button>` : ""}
      </div>
      <p class="app-error" role="alert"></p>
    </form>`);
  const form = $("event-form");
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const f = form.elements;
    if (!f.title.value.trim() || !f.date.value) {
      form.querySelector(".app-error").textContent = "Le titre et la date sont obligatoires.";
      return;
    }
    const saved = await guarded(form.querySelector("[type=submit]"), async () => {
      needOnline();
      return await api("save-event", { event: { id: e.id, date: f.date.value, time: f.time.value, title: f.title.value.trim(), location: f.location.value.trim(), kind: f.kind.value, note: f.note.value.trim() } });
    });
    if (!saved) return;
    closeSheet();
    toast("Événement enregistré.");
    plan.selected = f.date.value;
    plan.cursor = f.date.value;
    render();
  });
  $("event-delete")?.addEventListener("click", async (click) => {
    if (!window.confirm(`Supprimer « ${e.title} » du planning ?`)) return;
    const done = await guarded(click.currentTarget, async () => { needOnline(); return await api("delete-event", { id: e.id }); });
    if (!done) return;
    closeSheet();
    toast("Événement supprimé.");
    render();
  });
}

// ================================================================ espace client

const DELIVERY = { photos: "Galerie photos", video: "Vidéos", web: "Suivi de site", social: "Contenus réseaux" };
let spaceFilter = "open";
let spaces = { galleries: [], orders: [], feedback: [] };

async function renderSpaces() {
  spaces = await load("spaces", () => call("admin-api", { method: "GET" }));
  const now = Date.now();
  const isOpen = (g) => g.status === "open" && Date.parse(g.expires_at) > now;
  const list = (spaces.galleries ?? []).filter((g) => (spaceFilter === "open" ? isOpen(g) : !isOpen(g)));
  return `<div class="app-segment">${[["open", "Ouverts"], ["closed", "Fermés"]].map(([k, l]) => `<button type="button" class="${spaceFilter === k ? "is-active" : ""}" data-sfilter="${k}">${l}</button>`).join("")}</div>
    <ul class="app-list app-section">${list.length ? list.map((g) => {
      const orders = (spaces.orders ?? []).filter((o) => o.gallery_id === g.id && o.paid_at);
      return `<li><button type="button" class="app-row ${isOpen(g) ? "is-confirmed" : "is-pending"}" data-space="${esc(g.id)}">
        <b>${esc(g.name)}</b>
        <span class="app-amount">${g.accessCode ? `<span class="app-pill">${esc(g.accessCode)}</span>` : ""}</span>
        <small>${esc(DELIVERY[g.delivery || "photos"] ?? "Galerie")} · ${isOpen(g) ? `jusqu'au ${esc(shortDate(g.expires_at))}` : "fermé"}${orders.length ? ` · ${orders.length} commande${orders.length > 1 ? "s" : ""}` : ""}</small>
      </button></li>`;
    }).join("") : `<li class="app-empty">${spaceFilter === "open" ? "Aucun espace client ouvert." : "Aucun espace fermé."}</li>`}</ul>
    <p class="app-hint">Création d'un espace et envoi des photos : bouton +, dans la version complète.</p>`;
}
TABS.espace.bind = (root) => {
  root.querySelectorAll("[data-sfilter]").forEach((b) => b.addEventListener("click", () => { spaceFilter = b.dataset.sfilter; render(); }));
  root.querySelectorAll("[data-space]").forEach((b) => b.addEventListener("click", () => spaceSheet(b.dataset.space)));
};

function spaceSheet(id) {
  const g = (spaces.galleries ?? []).find((x) => x.id === id);
  if (!g) return;
  const open = g.status === "open" && Date.parse(g.expires_at) > Date.now();
  const orders = (spaces.orders ?? []).filter((o) => o.gallery_id === id);
  const paid = orders.filter((o) => o.paid_at);
  const feedback = (spaces.feedback ?? []).filter((f) => f.gallery_id === id);
  openSheet(`<p class="app-eyebrow">${esc(DELIVERY[g.delivery || "photos"] ?? "Galerie")}</p>
    <h2>${esc(g.name)}</h2>
    <dl class="app-facts">
      <dt>Statut</dt><dd>${open ? `<span class="app-pill is-ok">Ouvert</span>` : `<span class="app-pill">Fermé</span>`}</dd>
      <dt>Accès jusqu'au</dt><dd>${esc(shortDate(g.expires_at))}</dd>
      <dt>Code d'accès</dt><dd>${g.accessCode ? `<strong>${esc(g.accessCode)}</strong>` : "—"}</dd>
      <dt>Créé le</dt><dd>${esc(shortDate(g.created_at))}</dd>
      ${orders.length ? `<dt>Commandes</dt><dd>${paid.length} payée${paid.length > 1 ? "s" : ""} · ${money(paid.reduce((s, o) => s + o.total_cents, 0))}</dd>` : ""}
      ${g.delivery === "web" ? `<dt>Retours du client</dt><dd>${feedback.length ? `${feedback.length} série${feedback.length > 1 ? "s" : ""} reçue${feedback.length > 1 ? "s" : ""}` : "aucun pour l'instant"}</dd>` : ""}
    </dl>
    <div class="app-actions">
      ${g.accessCode ? `<button class="app-button" type="button" id="space-share">Partager l'accès</button>` : ""}
      <button class="app-button-ghost" type="button" id="space-manage">Gérer (version complète)</button>
      ${open ? `<button class="app-button-danger" type="button" id="space-close">Fermer l'espace</button>` : ""}
    </div>`);
  $("space-share")?.addEventListener("click", async () => {
    const text = `Votre espace client : ${window.location.origin}/galerie.html — code d'accès : ${g.accessCode}`;
    try {
      if (navigator.share) await navigator.share({ title: g.name, text });
      else { await navigator.clipboard.writeText(text); toast("Accès copié."); }
    } catch { /* partage annulé */ }
  });
  $("space-manage").addEventListener("click", () => openDesktop("/admin-galeries.html"));
  $("space-close")?.addEventListener("click", async (event) => {
    if (!window.confirm(`Fermer « ${g.name} » ? Le client ne pourra plus y accéder.`)) return;
    const done = await guarded(event.currentTarget, async () => { needOnline(); return await call("admin-api", { body: { action: "close-gallery", galleryId: id } }); });
    if (!done) return;
    closeSheet();
    toast("Espace fermé.");
    render();
  });
}

// ================================================================ gestion (devis, factures, clients)

const mgmt = { tab: "devis", issuer: "all", search: "" };

async function renderManagement() {
  const sub = window.location.hash.split("/")[1];
  if (["devis", "factures", "clients"].includes(sub)) mgmt.tab = sub;
  const head = `<div class="app-segment">${[["devis", "Devis"], ["factures", "Factures"], ["clients", "Clients"]].map(([k, l]) => `<button type="button" class="${mgmt.tab === k ? "is-active" : ""}" data-mtab="${k}">${l}</button>`).join("")}</div>`;
  const issuerChips = `<div class="app-chips">${[["all", "Tous"], ["alexandre", "Alex"], ["elisa", "Elisa"]].map(([k, l]) => `<button type="button" class="notif-filter${mgmt.issuer === k ? " is-active" : ""}" data-issuer="${k}">${l}</button>`).join("")}</div>`;
  const byIssuer = (list) => (mgmt.issuer === "all" ? list : list.filter((x) => x.issuer === mgmt.issuer));

  if (mgmt.tab === "devis") {
    const { quotes = [] } = await load("quotes", () => api("list-quotes"));
    const list = byIssuer(quotes);
    return `${head}${issuerChips}<ul class="app-list app-section">${list.length ? list.map((q) => `<li><button type="button" class="app-row${tone(QUOTE_STATUS, q.status)}" data-quote="${esc(q.id)}">
      <b>${esc(q.client_name || "Sans client")}</b><span class="app-amount">${money(q.total_ttc_cents)}<br>${pill(QUOTE_STATUS, q.status)}</span>
      <small>${esc(q.number || "Brouillon")} · ${ISSUER[q.issuer] ?? ""}${q.bundle ? " · à deux" : ""} · ${esc(shortDate(q.issue_date))}</small></button></li>`).join("") : `<li class="app-empty">Aucun devis.</li>`}</ul>`;
  }
  if (mgmt.tab === "factures") {
    const { invoices = [] } = await load("invoices", () => api("list-invoices"));
    const list = byIssuer(invoices);
    const remaining = list.reduce((s, i) => s + Math.max(0, i.remaining_cents || 0), 0);
    return `${head}${issuerChips}<p class="app-hint">Reste à encaisser : <strong>${money(remaining)}</strong></p>
      <ul class="app-list app-section">${list.length ? list.map((i) => `<li><button type="button" class="app-row${tone(INVOICE_STATUS, i.status)}" data-invoice="${esc(i.id)}">
      <b>${esc(i.client_name || "Sans client")}</b><span class="app-amount">${money(i.total_ttc_cents)}<br>${pill(INVOICE_STATUS, i.status)}</span>
      <small>${esc(i.number || "Brouillon")} · ${i.kind === "deposit" ? "Acompte" : "Facture"} · ${ISSUER[i.issuer] ?? ""}${i.remaining_cents > 0 ? ` · reste ${money(i.remaining_cents)}` : ""}</small></button></li>`).join("") : `<li class="app-empty">Aucune facture.</li>`}</ul>`;
  }
  const { clients = [] } = await load(`clients:${mgmt.search}`, () => api("list-clients", { q: mgmt.search }));
  return `${head}<label class="app-field app-search"><span class="app-eyebrow" style="margin:0">Rechercher</span><input type="search" id="client-search" placeholder="Nom ou e-mail" value="${esc(mgmt.search)}" enterkeyhint="search"></label>
    <ul class="app-list app-section">${clients.length ? clients.map((c) => `<li><button type="button" class="app-row" data-client="${esc(c.id)}">
      <b>${esc(c.name)}</b><small>${esc(c.email || c.phone || "—")}${c.city ? ` · ${esc(c.city)}` : ""}</small></button></li>`).join("") : `<li class="app-empty">Aucun client.</li>`}</ul>`;
}
TABS.gestion.bind = (root) => {
  root.querySelectorAll("[data-mtab]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `gestion/${b.dataset.mtab}`; }));
  root.querySelectorAll("[data-issuer]").forEach((b) => b.addEventListener("click", () => { mgmt.issuer = b.dataset.issuer; render(); }));
  root.querySelectorAll("[data-quote]").forEach((b) => b.addEventListener("click", () => quoteSheet(b.dataset.quote)));
  root.querySelectorAll("[data-invoice]").forEach((b) => b.addEventListener("click", () => invoiceSheet(b.dataset.invoice)));
  root.querySelectorAll("[data-client]").forEach((b) => b.addEventListener("click", () => clientSheet(b.dataset.client)));
  const search = $("client-search");
  if (search) {
    let timer;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        mgmt.search = search.value.trim();
        await render();
        const again = $("client-search");
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 350);
    });
  }
};

const itemsHtml = (items = []) => `<ul class="app-items">${items.map((it) => `<li><span>${esc(it.title)}${Number(it.quantity) !== 1 ? ` × ${esc(it.quantity)}` : ""}</span><span>${money(it.total_ht_cents)}</span></li>`).join("")}</ul>`;

async function quoteSheet(id) {
  const body = openSheet(`<p class="app-loading">Chargement…</p>`);
  try {
    const data = await load(`quote:${id}`, () => api("get-quote", { id }));
    const q = data.quote;
    const c = q.client_snapshot || {};
    openSheet(`<p class="app-eyebrow">Devis ${esc(q.number || "brouillon")} · ${ISSUER[q.issuer] ?? ""}</p>
      <h2>${esc(c.name || "Sans client")}</h2>
      <dl class="app-facts">
        <dt>Statut</dt><dd>${pill(QUOTE_STATUS, q.status)}</dd>
        <dt>Total</dt><dd><strong>${money(q.total_ttc_cents)}</strong></dd>
        ${q.deposit_cents ? `<dt>Acompte</dt><dd>${money(q.deposit_cents)} · reçu ${money(data.deposit?.receivedCents)}</dd>` : ""}
        ${q.service_date ? `<dt>Prestation</dt><dd>${esc(dayLabel(q.service_date))}${q.service_time ? ` · ${esc(timeOf(q.service_time))}` : ""}${q.service_location ? `<br>${esc(q.service_location)}` : ""}</dd>` : ""}
        ${q.valid_until ? `<dt>Valable jusqu'au</dt><dd>${esc(shortDate(q.valid_until))}</dd>` : ""}
        ${c.email ? `<dt>E-mail</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ""}
        ${c.phone ? `<dt>Téléphone</dt><dd><a href="tel:${esc(String(c.phone).replace(/\s/g, ""))}">${esc(c.phone)}</a></dd>` : ""}
        ${data.partner ? `<dt>Devis associé</dt><dd>${esc(data.partner.number || "brouillon")} (${ISSUER[data.partner.issuer] ?? ""})${data.pair && !data.pair.complete ? " — à compléter" : ""}</dd>` : ""}
        ${q.response_comment ? `<dt>Commentaire</dt><dd>${esc(q.response_comment)}</dd>` : ""}
      </dl>
      ${q.project_description ? `<h3>Projet</h3><p class="app-message">${esc(q.project_description)}</p>` : ""}
      <h3>Prestations</h3>${itemsHtml(q.items)}
      ${(data.invoices ?? []).length ? `<h3>Factures</h3><ul class="app-list">${data.invoices.map((i) => `<li><button type="button" class="app-row${tone(INVOICE_STATUS, i.status)}" data-invoice="${esc(i.id)}"><b>${esc(i.number || "Brouillon")}</b><span class="app-amount">${money(i.total_ttc_cents)}</span><small>${i.kind === "deposit" ? "Acompte" : "Facture"}</small></button></li>`).join("")}</ul>` : ""}
      <div class="app-actions">
        ${q.number ? `<button class="app-button" type="button" id="q-pdf">${data.partner ? "PDF de la proposition" : "PDF du devis"}</button>` : ""}
        ${q.signed_pdf_path ? `<button class="app-button-ghost" type="button" id="q-signed">PDF signé</button>` : ""}
        ${q.number && ["sent", "draft"].includes(q.status) ? `<button class="app-button-ghost" type="button" id="q-send">Envoyer au client</button>` : ""}
        <button class="app-button-ghost" type="button" id="q-full">${q.number ? "Ouvrir dans la gestion complète" : "Modifier le brouillon"}</button>
      </div>`);
    $("q-pdf")?.addEventListener("click", (e) => openPdf(e.currentTarget, { kind: "quote", id }));
    $("q-signed")?.addEventListener("click", (e) => openPdf(e.currentTarget, { kind: "quote", id, signed: true }));
    $("q-send")?.addEventListener("click", (e) => sendDocument(e.currentTarget, "quote", id, c.email));
    $("q-full").addEventListener("click", () => openDesktop(`/gestion-commerciale.html#${q.number ? "devis" : "brouillon"}=${id}`));
    $("sheet-body").querySelectorAll("[data-invoice]").forEach((b) => b.addEventListener("click", () => invoiceSheet(b.dataset.invoice)));
  } catch (error) {
    body.innerHTML = `<p class="app-empty">${esc(error.message)}</p>`;
  }
}

async function invoiceSheet(id) {
  const body = openSheet(`<p class="app-loading">Chargement…</p>`);
  try {
    const { invoice: i } = await load(`invoice:${id}`, () => api("get-invoice", { id }));
    const c = i.client_snapshot || {};
    const remaining = ["draft", "cancelled"].includes(i.status) ? 0 : i.amount_due_cents - i.paid_cents;
    openSheet(`<p class="app-eyebrow">${i.kind === "deposit" ? "Facture d'acompte" : "Facture"} ${esc(i.number || "brouillon")} · ${ISSUER[i.issuer] ?? ""}</p>
      <h2>${esc(c.name || "Sans client")}</h2>
      <dl class="app-facts">
        <dt>Statut</dt><dd>${pill(INVOICE_STATUS, i.status)}</dd>
        <dt>Total</dt><dd><strong>${money(i.total_ttc_cents)}</strong></dd>
        <dt>Payé</dt><dd>${money(i.paid_cents)}</dd>
        ${remaining > 0 ? `<dt>Reste à payer</dt><dd><strong>${money(remaining)}</strong></dd>` : ""}
        ${i.due_date ? `<dt>Échéance</dt><dd>${esc(shortDate(i.due_date))}</dd>` : ""}
        ${c.email ? `<dt>E-mail</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ""}
      </dl>
      <h3>Lignes</h3>${itemsHtml(i.items)}
      ${(i.payments ?? []).length ? `<h3>Règlements</h3><ul class="app-items">${i.payments.map((p) => `<li><span>${esc(shortDate(p.paid_on))} · ${esc(p.method)}</span><span>${money(p.amount_cents)}</span></li>`).join("")}</ul>` : ""}
      <div class="app-actions">
        ${i.number ? `<button class="app-button" type="button" id="i-pdf">PDF de la facture</button>` : ""}
        ${remaining > 0 && ["issued", "partially_paid", "overdue"].includes(i.status) ? `<button class="app-button-ghost" type="button" id="i-pay">Enregistrer un règlement</button>` : ""}
        ${i.number ? `<button class="app-button-ghost" type="button" id="i-send">Envoyer au client</button>` : ""}
        <button class="app-button-ghost" type="button" id="i-full">Ouvrir dans la gestion complète</button>
      </div>`);
    $("i-pdf")?.addEventListener("click", (e) => openPdf(e.currentTarget, { kind: "invoice", id }));
    $("i-send")?.addEventListener("click", (e) => sendDocument(e.currentTarget, "invoice", id, c.email));
    $("i-pay")?.addEventListener("click", () => paymentSheet(i, remaining));
    $("i-full").addEventListener("click", () => openDesktop(`/gestion-commerciale.html#facture=${id}`));
  } catch (error) {
    body.innerHTML = `<p class="app-empty">${esc(error.message)}</p>`;
  }
}

function paymentSheet(invoice, remaining) {
  openSheet(`<p class="app-eyebrow">Facture ${esc(invoice.number)}</p><h2>Enregistrer un règlement</h2>
    <form class="app-form" id="pay-form" style="width:100%" novalidate>
      <label class="app-field"><span>Montant (€) *</span><input name="amount" inputmode="decimal" value="${(remaining / 100).toFixed(2).replace(".", ",")}" required></label>
      <label class="app-field"><span>Date *</span><input name="paidOn" type="date" value="${today()}" required></label>
      <label class="app-field"><span>Mode</span><select name="method">
        <option value="virement">Virement</option><option value="carte">Carte</option><option value="especes">Espèces</option><option value="cheque">Chèque</option><option value="autre">Autre</option></select></label>
      <label class="app-field"><span>Référence</span><input name="reference" maxlength="200"></label>
      <div class="app-actions"><button class="app-button" type="submit">Enregistrer</button></div>
    </form>`);
  const form = $("pay-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const f = form.elements;
    const cents = Math.round(Number(f.amount.value.replace(/\s/g, "").replace(",", ".")) * 100);
    if (!cents || cents < 1) { toast("Montant invalide."); return; }
    const done = await guarded(form.querySelector("[type=submit]"), async () => {
      needOnline();
      return await api("add-payment", { invoiceId: invoice.id, amountCents: cents, paidOn: f.paidOn.value, method: f.method.value, reference: f.reference.value.trim() });
    });
    if (!done) return;
    toast("Règlement enregistré.");
    invoiceSheet(invoice.id);
    if (current === "gestion" || current === "accueil") render();
  });
}

async function clientSheet(id) {
  const body = openSheet(`<p class="app-loading">Chargement…</p>`);
  try {
    const data = await load(`client:${id}`, () => api("get-client", { id }));
    const c = data.client;
    const address = [c.address, `${c.postal_code || ""} ${c.city || ""}`.trim(), c.country].filter(Boolean).join(", ");
    openSheet(`<p class="app-eyebrow">Client · ${c.type === "professionnel" ? "professionnel" : "particulier"}</p>
      <h2>${esc(c.name)}</h2>
      <dl class="app-facts">
        ${c.email ? `<dt>E-mail</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ""}
        ${c.phone ? `<dt>Téléphone</dt><dd><a href="tel:${esc(String(c.phone).replace(/\s/g, ""))}">${esc(c.phone)}</a></dd>` : ""}
        ${address ? `<dt>Adresse</dt><dd>${esc(address)}</dd>` : ""}
        ${c.siret ? `<dt>SIRET</dt><dd>${esc(c.siret)}</dd>` : ""}
      </dl>
      <h3>Devis</h3>${(data.quotes ?? []).length ? `<ul class="app-list">${data.quotes.map((q) => `<li><button type="button" class="app-row${tone(QUOTE_STATUS, q.status)}" data-quote="${esc(q.id)}"><b>${esc(q.number || "Brouillon")}</b><span class="app-amount">${money(q.total_ttc_cents)}</span><small>${pill(QUOTE_STATUS, q.status)}</small></button></li>`).join("")}</ul>` : `<p class="app-hint">Aucun.</p>`}
      <h3>Factures</h3>${(data.invoices ?? []).length ? `<ul class="app-list">${data.invoices.map((i) => `<li><button type="button" class="app-row${tone(INVOICE_STATUS, i.status)}" data-invoice="${esc(i.id)}"><b>${esc(i.number || "Brouillon")}</b><span class="app-amount">${money(i.total_ttc_cents)}</span><small>${pill(INVOICE_STATUS, i.status)}</small></button></li>`).join("")}</ul>` : `<p class="app-hint">Aucune.</p>`}
      <div class="app-actions">
        ${c.phone ? `<a class="app-button" href="tel:${esc(String(c.phone).replace(/\s/g, ""))}">Appeler</a>` : ""}
        ${c.email ? `<a class="app-button-ghost" href="mailto:${esc(c.email)}">Écrire un e-mail</a>` : ""}
        <button class="app-button-danger" type="button" id="client-erase">Effacer ce client (RGPD)</button>
      </div>`);
    const sheetBody = $("sheet-body");
    sheetBody.querySelectorAll("[data-quote]").forEach((b) => b.addEventListener("click", () => quoteSheet(b.dataset.quote)));
    sheetBody.querySelectorAll("[data-invoice]").forEach((b) => b.addEventListener("click", () => invoiceSheet(b.dataset.invoice)));
    $("client-erase").addEventListener("click", async (event) => {
      const ok = window.confirm(`Effacer les données de « ${c.name} » ?\n\nSupprimés : devis non acceptés (et PDF), demandes du formulaire, coordonnées de la fiche.\nConservés (obligation légale) : factures et devis acceptés ou signés.\n\nCette action est irréversible.`);
      if (!ok) return;
      const r = await guarded(event.currentTarget, async () => { needOnline(); return await api("erase-client", { id }); });
      if (!r) return;
      closeSheet();
      toast(r.clientDeleted ? "Client effacé." : "Coordonnées effacées ; factures conservées.");
      clearCache();
      render();
    });
  } catch (error) {
    body.innerHTML = `<p class="app-empty">${esc(error.message)}</p>`;
  }
}

// ================================================================ menu, installation, notifications

function installSheet() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  openSheet(`<h2>Installer l'application</h2>
    ${isStandalone() ? `<p class="app-hint">L'application est déjà installée sur cet appareil.</p>` : ""}
    <ol class="app-steps">
      <li>Ouvrez <strong>alexandrepalanca.fr/app</strong> dans <strong>Safari</strong>${ios ? "" : " (sur iPhone)"}.</li>
      <li>Touchez le bouton <strong>Partager</strong> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9"/></svg> en bas de l'écran.</li>
      <li>Choisissez <strong>« Sur l'écran d'accueil »</strong>, puis <strong>Ajouter</strong>.</li>
      <li>Ouvrez « Alex &amp; Elisa » depuis l'écran d'accueil : l'application s'affiche en plein écran et reste connectée.</li>
    </ol>
    <p class="app-hint">Sur Android (Chrome) : menu ⋮ puis « Installer l'application ».</p>`);
}

function menuSheet() {
  openSheet(`<p class="app-eyebrow">Connecté${session?.email ? ` · ${esc(session.email)}` : ""}</p><h2>Menu</h2>
    <div class="app-actions">
      <button class="app-button" type="button" data-m="notifications">Notifications</button>
      <button class="app-button-ghost" type="button" data-m="install">Installer sur l'iPhone</button>
      <button class="app-button-ghost" type="button" data-m="commerce">Gestion commerciale complète</button>
      <button class="app-button-ghost" type="button" data-m="spaces">Espaces clients (création, envoi de photos)</button>
      <button class="app-button-danger" type="button" data-m="logout">Se déconnecter</button>
    </div>`);
  $("sheet-body").querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.m;
    if (m === "notifications") notificationsSheet();
    if (m === "install") installSheet();
    if (m === "commerce") openDesktop("/gestion-commerciale.html");
    if (m === "spaces") openDesktop("/admin-galeries.html");
    if (m === "logout" && window.confirm("Se déconnecter de l'application ?")) logout("Vous êtes déconnecté.");
  }));
}

// ================================================================ notifications push

const PUSH_ON = "app-push-on";
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const pushCall = (action, body = {}) => call("push", { body: { action, ...body } });

function keyBytes(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return await reg.pushManager.getSubscription();
}

async function subscribeDevice(publicKey) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Clé du serveur changée : on repart d'un abonnement neuf
  if (sub && sub.options?.applicationServerKey) {
    const current = new Uint8Array(sub.options.applicationServerKey);
    const wanted = keyBytes(publicKey);
    if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await pushCall("subscribe", { subscription: sub.toJSON() });
  try { localStorage.setItem(PUSH_ON, "1"); } catch { /* rien */ }
  return sub;
}

// À chaque ouverture : l'abonnement de l'appareil est renvoyé au serveur (renouvellement, nouvelle version)
async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== "granted" || !navigator.onLine) return;
    if (localStorage.getItem(PUSH_ON) !== "1") return;
    const { publicKey } = await pushCall("config");
    await subscribeDevice(publicKey);
  } catch (error) {
    console.warn("Synchronisation des notifications impossible", error);
  }
}

async function notificationsSheet() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const intro = `<h2>Notifications</h2>
    <p class="app-hint" style="font-size:.88rem;color:var(--soft)">Recevez sur votre téléphone, même application fermée :</p>
    <ul class="app-steps" style="margin:10px 0 0">
      <li><strong>Planning</strong> — un rappel avant chaque rendez-vous, et le programme du jour à 8 h.</li>
      <li><strong>Échéances</strong> — quand une tâche du centre « À faire » arrive à échéance (acompte, devis à relancer…).</li>
      <li><strong>Espace client</strong> — galeries à publier, espaces qui expirent, commandes.</li>
      <li><strong>Administration</strong> — nouvelle demande, devis accepté ou refusé, virement signalé.</li>
      <li><strong>Système</strong> — si une tâche automatique du site échoue.</li>
    </ul>`;
  if (!pushSupported()) {
    openSheet(`${intro}<p class="app-empty" style="margin-top:16px">${ios && !isStandalone()
      ? "Sur iPhone, les notifications fonctionnent uniquement depuis l'application installée sur l'écran d'accueil (iOS 16.4 ou plus récent)."
      : "Cet appareil ou ce navigateur ne prend pas en charge les notifications."}</p>
      ${ios && !isStandalone() ? `<div class="app-actions"><button class="app-button" type="button" id="push-install">Installer l'application</button></div>` : ""}`);
    $("push-install")?.addEventListener("click", installSheet);
    return;
  }
  const body = openSheet(`${intro}<p class="app-loading">Chargement…</p>`);
  let config;
  try {
    needOnline();
    config = await pushCall("config");
  } catch (error) {
    body.insertAdjacentHTML("beforeend", `<p class="app-empty">${esc(error.message)}</p>`);
    body.querySelector(".app-loading")?.remove();
    return;
  }
  const sub = await currentSubscription();
  const active = Notification.permission === "granted" && sub && config.devices.some((d) => d.endpoint === sub.endpoint);
  const p = config.prefs;
  const sw = (name, label, checked, hint = "") => `<label class="app-switch"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ""}</span></label>`;
  openSheet(`${intro}
    ${Notification.permission === "denied" ? `<p class="app-empty" style="margin-top:16px">Les notifications sont bloquées pour cette application. Réglages de l'iPhone → Notifications → Alex &amp; Elisa → Autoriser.</p>` : ""}
    ${active ? `<p class="app-hint">Activées sur cet appareil.</p>` : `<div class="app-actions"><button class="app-button" type="button" id="push-enable" ${Notification.permission === "denied" ? "disabled" : ""}>Activer sur cet appareil</button></div>
      <p class="app-hint">L'iPhone vous demandera votre accord. Vous pourrez tout désactiver à tout moment.</p>`}
    <form id="push-form" class="app-form" style="width:100%;margin-top:18px">
      <h3>Préférences</h3>
      ${sw("enabled", "Toutes les notifications", p.enabled)}
      ${sw("planning", "Planning", p.categories.planning)}
      <label class="app-field"><span>Rappel avant un rendez-vous</span><select name="planningLead">${[[15, "15 minutes avant"], [30, "30 minutes avant"], [60, "1 heure avant"], [120, "2 heures avant"], [1440, "La veille (24 h avant)"]].map(([v, l]) => `<option value="${v}" ${p.planningLead === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      ${sw("planningMorning", "Programme du jour à 8 h", p.planningMorning)}
      ${sw("taches", "Échéances (À faire)", p.categories.taches)}
      <label class="app-field"><span>Prévenir avant une échéance</span><select name="taskLead">${[[2, "2 heures avant"], [6, "6 heures avant"], [24, "24 heures avant"], [48, "48 heures avant"]].map(([v, l]) => `<option value="${v}" ${p.taskLead === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      ${sw("espace", "Espace client", p.categories.espace)}
      ${sw("admin", "Administration", p.categories.admin, "Demandes, devis, factures, virements")}
      ${sw("systeme", "Alertes système", p.categories.systeme)}
      ${sw("quiet", "Silence la nuit (22 h – 7 h)", p.quiet, "Sauf alertes système ; le reste arrive le matin")}
      <div class="app-actions"><button class="app-button" type="submit">Enregistrer les préférences</button></div>
    </form>
    ${active ? `<div class="app-actions">
      <button class="app-button-ghost" type="button" id="push-test">Envoyer une notification de test</button>
      <button class="app-button-danger" type="button" id="push-disable">Désactiver sur cet appareil</button></div>` : ""}
    ${config.devices.length ? `<h3>Appareils abonnés</h3><ul class="app-items">${config.devices.map((d) => `<li><span>${esc(/iPhone/.test(d.user_agent) ? "iPhone" : /iPad/.test(d.user_agent) ? "iPad" : /Android/.test(d.user_agent) ? "Android" : /Mac/.test(d.user_agent) ? "Mac" : "Navigateur")}${sub && d.endpoint === sub.endpoint ? " (celui-ci)" : ""}</span><span>${d.failures ? "erreurs d'envoi" : d.last_success_at ? `reçu le ${esc(shortDate(d.last_success_at))}` : "actif"}</span></li>`).join("")}</ul>` : ""}`);

  $("push-enable")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      // Demande d'autorisation : uniquement ici, après un geste volontaire
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { toast("Autorisation refusée : aucune notification ne sera envoyée."); return notificationsSheet(); }
      await subscribeDevice(config.publicKey);
      await pushCall("test");
      toast("Notifications activées.");
      notificationsSheet();
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  });
  $("push-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const f = event.currentTarget.elements;
    const prefs = {
      enabled: f.enabled.checked, planningLead: Number(f.planningLead.value), planningMorning: f.planningMorning.checked,
      taskLead: Number(f.taskLead.value), quiet: f.quiet.checked,
      categories: { planning: f.planning.checked, taches: f.taches.checked, espace: f.espace.checked, admin: f.admin.checked, systeme: f.systeme.checked }
    };
    const done = await guarded(event.currentTarget.querySelector("[type=submit]"), async () => { needOnline(); return await pushCall("save-prefs", { prefs }); });
    if (done) toast("Préférences enregistrées.");
  });
  $("push-test")?.addEventListener("click", async (event) => {
    const r = await guarded(event.currentTarget, async () => { needOnline(); return await pushCall("test"); });
    if (r) toast(r.results.some((x) => x.status >= 200 && x.status < 300) ? "Notification envoyée." : "Envoi impossible : réactivez les notifications.");
  });
  $("push-disable")?.addEventListener("click", async (event) => {
    const done = await guarded(event.currentTarget, async () => {
      needOnline();
      const current = await currentSubscription();
      if (current) { await pushCall("unsubscribe", { endpoint: current.endpoint }); await current.unsubscribe(); }
      try { localStorage.removeItem(PUSH_ON); } catch { /* rien */ }
      return true;
    });
    if (done) { toast("Notifications désactivées sur cet appareil."); notificationsSheet(); }
  });
}

// Notification touchée alors que l'application est ouverte : affiche l'écran concerné
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type !== "open") return;
  const url = new URL(event.data.url, window.location.origin);
  if (url.hash) window.location.hash = url.hash.slice(1);
});

// ================================================================ connexion / démarrage

function showLogin(message = "") {
  $("shell").hidden = true;
  $("login").hidden = false;
  $("login-message").textContent = message;
}

function logout(message) {
  // Plus de notifications sur un appareil déconnecté
  if (session && pushSupported()) {
    currentSubscription().then(async (sub) => {
      if (!sub) return;
      try { await pushCall("unsubscribe", { endpoint: sub.endpoint }); } catch { /* session déjà expirée */ }
      await sub.unsubscribe();
    }).catch(() => {});
    try { localStorage.removeItem(PUSH_ON); } catch { /* rien */ }
  }
  const refresh = session?.refresh;
  const access = session?.access;
  session = null;
  writeJson(SESSION_KEY, null);
  clearCache();
  try { sessionStorage.removeItem(DESKTOP_TOKEN); } catch { /* rien */ }
  closeSheet();
  showLogin(message);
  // Révocation de la session côté Supabase (sans bloquer)
  if (access && refresh && navigator.onLine) {
    fetch(`${BASE}/auth/v1/logout`, { method: "POST", headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${access}` } }).catch(() => {});
  }
}

function startApp() {
  $("login").hidden = true;
  $("shell").hidden = false;
  route();
  syncPush();
  try {
    if (!isStandalone() && !localStorage.getItem(INSTALL_SEEN) && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
      localStorage.setItem(INSTALL_SEEN, "1");
      setTimeout(installSheet, 800);
    }
  } catch { /* rien */ }
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("[type=submit]");
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || !password) { $("login-message").textContent = "E-mail et mot de passe obligatoires."; return; }
  button.disabled = true;
  $("login-message").textContent = "";
  try {
    storeAuth(await authRequest("password", { email, password }));
    // Vérification côté serveur : le compte doit figurer parmi les administrateurs
    await api("dashboard", { issuer: "alexandre" });
    $("login-password").value = "";
    startApp();
  } catch (error) {
    if (session) { session = null; writeJson(SESSION_KEY, null); }
    $("login-message").textContent = error instanceof OfflineError ? "Pas de connexion internet." : error.message;
  } finally {
    button.disabled = false;
  }
});
$("install-help-login").addEventListener("click", installSheet);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch((error) => console.warn("Service worker indisponible", error));
}

if (session) startApp();
else showLogin();
