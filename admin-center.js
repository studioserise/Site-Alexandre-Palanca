import { callGalleryFunction } from "./galeries-api.js";

// Accueil de l'administration : centre de notifications (classées par priorité) et planning mensuel.
const TOKEN_KEY = "gallery-admin-access-token";
const $ = (id) => document.getElementById(id);

const CATEGORY = { galerie: "Galerie", demande: "Demande", devis: "Devis", facture: "Facture", rappel: "Rappel" };
const FILTERS = [
  ["all", "Tout"], ["urgent", "Prioritaires"], ["demande", "Demandes"], ["devis", "Devis"],
  ["facture", "Factures"], ["galerie", "Galeries"], ["rappel", "Rappels"]
];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

let notes = [];
let filter = "all";
let month = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let entries = [];
let selectedDay = null;

function api(action, body = {}) {
  return callGalleryFunction("commerce-api", {
    body: { action, ...body },
    accessToken: window.sessionStorage.getItem(TOKEN_KEY)
  });
}

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const longDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ------------------------------------------------------------ notifications

function countdown(deadline) {
  const ms = Date.parse(deadline) - Date.now();
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const text = days ? `${days} j ${hours} h` : hours ? `${hours} h ${String(minutes).padStart(2, "0")} min` : `${minutes} min`;
  return ms >= 0 ? { text: `${text} restantes`, late: false } : { text: `en retard de ${text}`, late: true };
}

function visible() {
  if (filter === "all") return notes;
  if (filter === "urgent") return notes.filter((n) => n.level === "urgent" || n.level === "important");
  return notes.filter((n) => n.category === filter);
}

function renderNotes() {
  const list = visible();
  const urgent = notes.filter((n) => n.level === "urgent").length;
  $("notif-count").textContent = notes.length
    ? `${notes.length} notification${notes.length > 1 ? "s" : ""}${urgent ? ` · ${urgent} prioritaire${urgent > 1 ? "s" : ""}` : ""}`
    : "Tout est à jour";
  $("notif-filters").innerHTML = FILTERS.map(([key, label]) => {
    const count = key === "all" ? notes.length : key === "urgent"
      ? notes.filter((n) => n.level === "urgent" || n.level === "important").length
      : notes.filter((n) => n.category === key).length;
    return `<button type="button" class="notif-filter${filter === key ? " is-active" : ""}" data-filter="${key}">${label}${count ? ` <span>${count}</span>` : ""}</button>`;
  }).join("");
  $("notif-list").innerHTML = list.length ? list.map((n) => {
    const timer = n.deadline ? countdown(n.deadline) : null;
    return `<li class="notif notif-${n.level}" data-key="${esc(n.key)}">
      <span class="notif-dot" aria-hidden="true"></span>
      <div class="notif-body">
        <p class="notif-head"><span class="notif-chip">${CATEGORY[n.category] ?? ""}</span>
          ${timer ? `<span class="notif-timer${timer.late ? " is-late" : ""}" data-deadline="${esc(n.deadline)}">${esc(timer.text)}</span>` : ""}</p>
        <button type="button" class="notif-title" data-open="${esc(n.key)}">${esc(n.title)}</button>
        <p class="notif-detail">${esc(n.detail)}</p>
      </div>
      <button type="button" class="notif-close" data-dismiss="${esc(n.key)}" aria-label="Supprimer la notification" title="Supprimer la notification">×</button>
    </li>`;
  }).join("") : `<li class="notif-empty">${notes.length ? "Rien dans cette catégorie." : "Aucune notification : tout est à jour."}</li>`;
}

async function loadNotes() {
  $("notif-count").textContent = "Chargement…";
  try {
    const data = await api("notifications");
    notes = data.notifications;
    renderNotes();
  } catch (error) {
    $("notif-count").textContent = error.message;
  }
}

async function dismiss(key) {
  const item = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
  item?.classList.add("is-leaving");
  try {
    await api("dismiss-notification", { key });
    notes = notes.filter((n) => n.key !== key);
    renderNotes();
  } catch (error) {
    item?.classList.remove("is-leaving");
    alert(error.message);
  }
}

async function openNote(key) {
  const note = notes.find((n) => n.key === key);
  if (!note) return;
  if (note.contactRequestId) return openRequest(note);
  if (note.link) window.location.href = note.link;
}

// Détail d'une demande reçue par le formulaire
async function openRequest(note) {
  const dialog = $("request-dialog");
  $("request-content").innerHTML = "<p>Chargement…</p>";
  dialog.showModal();
  try {
    const { request: r } = await api("get-contact-request", { id: note.contactRequestId });
    const rows = [
      ["Reçue le", new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })],
      ["Nom", r.name],
      ["E-mail", r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : "", true],
      ["Téléphone", r.phone ? `<a href="tel:${esc(r.phone.replace(/\s+/g, ""))}">${esc(r.phone)}</a>` : "", true],
      ["Rubrique", r.service],
      ["Type de prestation", r.type],
      ["Date souhaitée", r.wanted_date ? longDate(r.wanted_date) : r.date_text],
      ["À vérifier", r.notes]
    ].filter(([, value]) => value);
    $("request-content").innerHTML = `<h2>Demande de ${esc(r.name || r.email || "sans nom")}</h2>
      <dl class="request-facts">${rows.map(([label, value, html]) => `<dt>${label}</dt><dd>${html ? value : esc(value)}</dd>`).join("")}</dl>
      <h3>Projet</h3><p class="request-message">${esc(r.message || "(aucun message)")}</p>
      <div class="request-actions">
        <a class="gallery-primary-button" href="gestion-commerciale.html#demande=${esc(r.id)}">Créer le devis</a>
        <button class="gallery-quiet-button" type="button" id="request-dismiss">Écarter la demande</button>
        <button class="gallery-quiet-button" type="button" data-close>Fermer</button>
      </div>`;
    $("request-dismiss").onclick = async () => {
      if (!confirm("Écarter cette demande ? Elle disparaîtra des notifications et du planning.")) return;
      await api("dismiss-contact-request", { id: r.id });
      dialog.close();
      notes = notes.filter((n) => n.key !== note.key);
      renderNotes();
      loadPlanning();
    };
  } catch (error) {
    $("request-content").innerHTML = `<p>${esc(error.message)}</p><button class="gallery-quiet-button" type="button" data-close>Fermer</button>`;
  }
}

// ------------------------------------------------------------ planning

function gridRange() {
  const first = new Date(month);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // lundi de la première semaine
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  return { start, end };
}

async function loadPlanning() {
  const { start, end } = gridRange();
  $("plan-title").textContent = `${MONTHS[month.getMonth()]} ${month.getFullYear()}`;
  try {
    const data = await api("planning", { from: iso(start), to: iso(end) });
    entries = data.entries;
  } catch (error) {
    entries = [];
    $("plan-day").innerHTML = `<p>${esc(error.message)}</p>`;
  }
  renderPlanning();
}

function renderPlanning() {
  const { start, end } = gridRange();
  const today = iso(new Date());
  const cells = [];
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const key = iso(day);
    const list = entries.filter((e) => e.date === key);
    const outside = day.getMonth() !== month.getMonth();
    cells.push(`<button type="button" class="plan-cell${outside ? " is-outside" : ""}${key === today ? " is-today" : ""}${key === selectedDay ? " is-selected" : ""}${list.some((e) => e.status === "confirmed") ? " has-confirmed" : list.length ? " has-pending" : ""}" data-day="${key}">
      <span class="plan-num">${day.getDate()}</span>
      ${list.slice(0, 3).map((e) => `<span class="plan-pill is-${e.status}">${e.time ? `${esc(e.time)} ` : ""}${esc(e.title)}</span>`).join("")}
      ${list.length > 3 ? `<span class="plan-more">+${list.length - 3}</span>` : ""}
      <span class="plan-dots">${list.map((e) => `<i class="is-${e.status}"></i>`).join("")}</span>
    </button>`);
  }
  $("plan-grid").innerHTML = DAYS.map((d) => `<span class="plan-dayname">${d}</span>`).join("") + cells.join("");
  renderDay();
}

const STATUS_LABEL = { confirmed: "Confirmé", pending: "À confirmer", other: "Autre" };
const SOURCE_LABEL = { devis: "Devis", demande: "Demande du site", manuel: "Ajouté à la main" };

function renderDay(editing = null) {
  const box = $("plan-day");
  if (!selectedDay) {
    box.innerHTML = `<p class="plan-hint">Touchez un jour pour voir le détail ou ajouter une date.</p>`;
    return;
  }
  const list = entries.filter((e) => e.date === selectedDay);
  const event = editing ? entries.find((e) => e.id === editing) : null;
  box.innerHTML = `<h3>${longDate(selectedDay)}</h3>
    ${list.length ? `<ul class="plan-list">${list.map((e) => `<li class="is-${e.status}">
      <span class="plan-badge">${STATUS_LABEL[e.status]}</span>
      <strong>${e.time ? `${esc(e.time)} — ` : ""}${esc(e.title)}</strong>
      ${e.location ? `<span>${esc(e.location)}</span>` : ""}${e.note ? `<span>${esc(e.note)}</span>` : ""}
      <small>${SOURCE_LABEL[e.source]}</small>
      <span class="plan-item-actions">
        ${e.link ? `<a href="${esc(e.link)}">Ouvrir</a>` : ""}
        ${e.source === "demande" ? `<button type="button" data-request="${esc(e.id)}">Voir la demande</button>` : ""}
        ${e.source === "manuel" ? `<button type="button" data-edit="${esc(e.id)}">Modifier</button><button type="button" data-delete="${esc(e.id)}">Supprimer</button>` : ""}
      </span></li>`).join("")}</ul>` : "<p class=\"plan-hint\">Aucune date ce jour-là.</p>"}
    <form class="plan-form" id="plan-form">
      <h4>${event ? "Modifier la date" : "Ajouter une date"}</h4>
      <div class="plan-form-row">
        <label>Date<input type="date" name="date" value="${esc(event?.date ?? selectedDay)}" required></label>
        <label>Heure<input type="time" name="time" value="${esc(event?.time ?? "")}"></label>
      </div>
      <label>Titre<input name="title" maxlength="200" required placeholder="Ex. Séance famille Martin" value="${esc(event?.title ?? "")}"></label>
      <label>Lieu<input name="location" maxlength="300" value="${esc(event?.location ?? "")}"></label>
      <fieldset class="plan-kind"><legend>Statut</legend>
        ${[["seance", "Séance confirmée"], ["option", "À confirmer"], ["autre", "Autre (indisponible…)"]].map(([value, label]) =>
          `<label><input type="radio" name="kind" value="${value}" ${(event?.kind ?? "seance") === value ? "checked" : ""}> ${label}</label>`).join("")}
      </fieldset>
      <label>Note<textarea name="note" rows="2" maxlength="2000">${esc(event?.note ?? "")}</textarea></label>
      <div class="plan-form-actions">
        <button class="gallery-primary-button" type="submit">${event ? "Enregistrer" : "Ajouter"}</button>
        ${event ? '<button class="gallery-quiet-button" type="button" id="plan-cancel">Annuler</button>' : ""}
      </div>
      <p class="plan-error" role="alert"></p>
    </form>`;
  const form = $("plan-form");
  form.onsubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    const f = form.elements;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api("save-event", { event: {
        id: event?.id, date: f.date.value, time: f.time.value, title: f.title.value,
        location: f.location.value, kind: f.kind.value, note: f.note.value
      } });
      selectedDay = f.date.value;
      const target = new Date(`${f.date.value}T12:00:00`);
      month = new Date(target.getFullYear(), target.getMonth(), 1);
      await loadPlanning();
      loadNotes();
    } catch (error) {
      form.querySelector(".plan-error").textContent = error.message;
      button.disabled = false;
    }
  };
  $("plan-cancel")?.addEventListener("click", () => renderDay());
}

// ------------------------------------------------------------ événements

function bind() {
  $("notif-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    filter = button.dataset.filter;
    renderNotes();
  });
  $("notif-list").addEventListener("click", (event) => {
    const close = event.target.closest("[data-dismiss]");
    if (close) return dismiss(close.dataset.dismiss);
    const open = event.target.closest("[data-open]");
    if (open) openNote(open.dataset.open);
  });
  $("notif-refresh").addEventListener("click", loadNotes);
  $("request-dialog").addEventListener("click", (event) => {
    if (event.target.closest("[data-close]") || event.target === $("request-dialog")) $("request-dialog").close();
  });
  $("plan-prev").addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); loadPlanning(); });
  $("plan-next").addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); loadPlanning(); });
  $("plan-today").addEventListener("click", () => {
    const now = new Date();
    month = new Date(now.getFullYear(), now.getMonth(), 1);
    selectedDay = iso(now);
    loadPlanning();
  });
  $("plan-grid").addEventListener("click", (event) => {
    const cell = event.target.closest("[data-day]");
    if (!cell) return;
    selectedDay = cell.dataset.day;
    renderPlanning();
    $("plan-day").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("plan-day").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit]");
    if (edit) return renderDay(edit.dataset.edit);
    const remove = event.target.closest("[data-delete]");
    if (remove && confirm("Supprimer cette date du planning ?")) {
      await api("delete-event", { id: remove.dataset.delete });
      await loadPlanning();
      loadNotes();
      return;
    }
    const request = event.target.closest("[data-request]");
    if (request) openRequest({ key: `demande:${request.dataset.request}`, contactRequestId: request.dataset.request });
  });
  // Comptes à rebours mis à jour toutes les 30 s
  setInterval(() => {
    document.querySelectorAll("[data-deadline]").forEach((el) => {
      const timer = countdown(el.dataset.deadline);
      el.textContent = timer.text;
      el.classList.toggle("is-late", timer.late);
    });
  }, 30_000);
}

let started = false;
export function startAdminCenter() {
  if (started) {
    loadNotes();
    loadPlanning();
    return;
  }
  started = true;
  bind();
  loadNotes();
  loadPlanning();
}
