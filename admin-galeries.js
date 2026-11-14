import { getConfig } from "./galeries-config.js?v=2";
import { callGalleryFunction, uploadSignedObject } from "./galeries-api.js?v=statut1";

const config = getConfig();
const loginForm = document.getElementById("admin-login-form");
const dashboard = document.getElementById("admin-dashboard");
const message = document.getElementById("admin-message");
const galleryList = document.getElementById("admin-gallery-list");
const orderList = document.getElementById("admin-order-list");
const photoGallerySelect = document.getElementById("admin-photo-gallery");
const tariffSelect = document.getElementById("admin-gallery-tariff");
const accessTokenKey = "gallery-admin-access-token";

let accessToken = window.sessionStorage.getItem(accessTokenKey);

function setMessage(text, isError = true) {
  message.textContent = text;
  message.style.color = isError ? "#e6aaa2" : "#c6d6c1";
  // Le message est en haut de la page : sur ordinateur, on le fait défiler à l'écran pour qu'une erreur ne passe pas inaperçue.
  if (text && isError) message.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Adresse collée sans « https:// » (ex. « we.tl/… », « drive.google.com/… ») : complétée automatiquement.
function normalizeUrl(value) {
  const url = value.trim();
  if (!url || /^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function makeText(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  return element;
}

function tariffLabel(tariff) {
  return {
    tarif0: "Gratuit",
    tarif2: "2 € / photo",
    tarif5: "5 € / photo"
  }[tariff] || "Tarif inconnu";
}

function updatePhotoUploadNote() {
  const tariff = photoGallerySelect.selectedOptions[0]?.dataset.tariff;
  const isFree = tariff === "tarif0";
  // Galerie gratuite : un seul dépôt (photos finales). Galerie payante : aperçus filigranés + originaux couplés.
  document.getElementById("admin-free-upload").hidden = !tariff || !isFree;
  document.getElementById("admin-paid-upload").hidden = Boolean(tariff) && isFree;
}

async function callAdmin(body) {
  try {
    return await callGalleryFunction("admin-api", {
      method: body ? "POST" : "GET",
      body,
      accessToken
    });
  } catch (error) {
    // Connexion expirée (au bout d'une heure, fréquent quand la page reste ouverte sur ordinateur) :
    // retour à la connexion avec un message clair, au lieu d'un « Invalid JWT » incompréhensible.
    if (error.status === 401 || /jwt|expired/i.test(String(error.message))) {
      window.sessionStorage.removeItem(accessTokenKey);
      accessToken = null;
      dashboard.hidden = true;
      loginForm.hidden = false;
      throw new Error("Votre connexion a expiré. Reconnectez-vous puis recommencez (les informations saisies sont conservées).");
    }
    throw error;
  }
}

async function signIn(email, password) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Le service sécurisé n’est pas encore configuré.");
  }
  const response = await fetch(
    `${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error(result.msg || result.message || "Connexion refusée.");
  }
  return result.access_token;
}

// Code d'accès de la galerie : affiché avec un bouton « Copier » ; pour les galeries créées avant
// la conservation des codes, possibilité d'en définir un nouveau (l'ancien cesse alors de fonctionner).
function renderAccessCode(gallery) {
  const box = document.createElement("div");
  box.className = "admin-code";
  if (gallery.accessCode) {
    box.append(makeText("span", "admin-code-label", "Code d’accès :"), makeText("code", "admin-code-value", gallery.accessCode));
    const copy = makeText("button", "gallery-quiet-button", "Copier");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(gallery.accessCode); copy.textContent = "Copié ✓"; }
      catch { copy.textContent = "Sélectionnez le code"; }
      setTimeout(() => { copy.textContent = "Copier"; }, 1800);
    });
    box.append(copy);
  } else {
    box.append(makeText("span", "admin-code-label", "Code d’accès non conservé (galerie créée avant)."));
  }
  if (gallery.status === "open") {
    const change = makeText("button", "gallery-quiet-button", gallery.accessCode ? "Changer le code" : "Définir un nouveau code");
    change.type = "button";
    const form = document.createElement("form");
    form.className = "admin-code-form";
    form.hidden = true;
    const input = document.createElement("input");
    input.className = "gallery-admin-input";
    input.placeholder = "Nouveau code (lettres, accents, signes, espaces…)";
    input.maxLength = 100;
    input.value = randomCode();
    const save = makeText("button", "gallery-primary-button", "Enregistrer");
    save.type = "submit";
    const note = makeText("small", "", "L’ancien code ne fonctionnera plus : pensez à transmettre le nouveau à votre client.");
    form.append(input, save, note);
    change.addEventListener("click", () => { form.hidden = !form.hidden; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        const result = await callAdmin({ action: "set-access-code", galleryId: gallery.id, code: input.value.trim() });
        await loadDashboard();
        setMessage(`Nouveau code enregistré pour « ${gallery.name} » : ${result.accessCode}`, false);
      } catch (error) {
        setMessage(error.message);
        save.disabled = false;
      }
    });
    box.append(change, form);
  }
  return box;
}

// ---- Livraison vidéo : liens de téléchargement (nom facultatif + adresse)
function videoRow(video = { label: "", url: "", multiple: false }) {
  const row = document.createElement("div");
  row.className = "admin-video-row";
  const url = document.createElement("input");
  url.className = "gallery-admin-input";
  url.type = "url";
  url.placeholder = "https://… (lien de téléchargement)";
  url.value = video.url;
  url.dataset.field = "url";
  const label = document.createElement("input");
  label.className = "gallery-admin-input";
  label.placeholder = "Nom affiché (facultatif) — ex. Film du mariage";
  label.maxLength = 120;
  label.value = video.label;
  label.dataset.field = "label";
  const remove = makeText("button", "gallery-quiet-button", "Retirer");
  remove.type = "button";
  remove.addEventListener("click", () => {
    if (row.parentElement.children.length > 1) row.remove();
    else { url.value = ""; label.value = ""; }
  });
  const several = document.createElement("label");
  several.className = "admin-video-multiple";
  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = video.multiple === true;
  check.dataset.field = "multiple";
  several.append(check, " Plusieurs vidéos dans ce lien (dossier ou zip)");
  row.append(url, label, remove, several);
  return row;
}
function readVideoRows(container) {
  return [...container.querySelectorAll(".admin-video-row")]
    .map((row) => ({
      url: normalizeUrl(row.querySelector('[data-field="url"]').value),
      label: row.querySelector('[data-field="label"]').value.trim(),
      multiple: row.querySelector('[data-field="multiple"]').checked
    }))
    .filter((video) => video.url);
}
function renderVideoLinks(gallery) {
  const box = document.createElement("div");
  box.className = "admin-video-links";
  const list = document.createElement("ul");
  list.className = "admin-video-current";
  for (const video of gallery.video_links ?? []) {
    const item = document.createElement("li");
    const link = makeText("a", "", `${video.label || video.url}${video.multiple ? " (plusieurs vidéos)" : ""}`);
    link.href = video.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    item.append(link);
    list.append(item);
  }
  box.append(list);
  if (gallery.status !== "open") return box;
  const edit = makeText("button", "gallery-quiet-button", "Modifier les liens");
  edit.type = "button";
  const form = document.createElement("form");
  form.hidden = true;
  const rows = document.createElement("div");
  for (const video of gallery.video_links?.length ? gallery.video_links : [undefined]) rows.append(videoRow(video));
  const add = makeText("button", "gallery-quiet-button", "+ Ajouter une vidéo");
  add.type = "button";
  add.addEventListener("click", () => rows.append(videoRow()));
  const save = makeText("button", "gallery-primary-button", "Enregistrer les liens");
  save.type = "submit";
  form.append(rows, add, save);
  edit.addEventListener("click", () => { form.hidden = !form.hidden; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await callAdmin({ action: "set-video-links", galleryId: gallery.id, videoLinks: readVideoRows(rows) });
      await loadDashboard();
      setMessage(`Liens enregistrés pour « ${gallery.name} ».`, false);
    } catch (error) {
      setMessage(error.message);
      save.disabled = false;
    }
  });
  box.append(edit, form);
  return box;
}

// ---- Lignes génériques (pages du site, dossiers réseaux)
const WEB_FIELDS = [
  { key: "name", placeholder: "Nom de la page (ex. Accueil)", max: 80 },
  { key: "url", placeholder: "https://… (adresse de la page)", type: "url" }
];
const SOCIAL_FIELDS = [
  { key: "label", placeholder: "Nom du dossier (ex. Stories novembre)", max: 120 },
  { key: "url", placeholder: "https://… (lien de téléchargement)", type: "url" },
  { key: "description", placeholder: "Ce qu’il contient (facultatif)", max: 300 }
];
function linkRow(fields, values = {}) {
  const row = document.createElement("div");
  row.className = "admin-video-row admin-link-row";
  for (const field of fields) {
    const input = document.createElement("input");
    input.className = "gallery-admin-input";
    input.type = field.type || "text";
    input.placeholder = field.placeholder;
    if (field.max) input.maxLength = field.max;
    input.value = values[field.key] ?? "";
    input.dataset.field = field.key;
    row.append(input);
  }
  const remove = makeText("button", "gallery-quiet-button", "Retirer");
  remove.type = "button";
  remove.addEventListener("click", () => {
    if (row.parentElement.children.length > 1) row.remove();
    else row.querySelectorAll("input").forEach((input) => { input.value = ""; });
  });
  row.append(remove);
  return row;
}
function readLinkRows(container, fields) {
  return [...container.querySelectorAll(".admin-link-row")]
    .map((row) => Object.fromEntries(fields.map((f) => {
      const value = row.querySelector(`[data-field="${f.key}"]`).value;
      return [f.key, f.key === "url" ? normalizeUrl(value) : value.trim()];
    })))
    .filter((entry) => entry.url);
}
async function uploadTutorial(galleryId, file) {
  if (file.type !== "application/pdf") throw new Error("Le guide doit être un fichier PDF.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Le guide PDF dépasse 20 Mo.");
  const target = await callAdmin({ action: "prepare-tutorial-upload", galleryId });
  await uploadSignedObject(target.bucket, target.path, target.token, file);
  await callAdmin({ action: "set-tutorial", galleryId, path: target.path });
}

// Suivi de site : pages, séries de modifications et retours reçus
function renderWebFollowUp(gallery, feedback) {
  const box = document.createElement("div");
  box.className = "admin-video-links";
  const list = document.createElement("ul");
  list.className = "admin-video-current";
  for (const page of gallery.web_pages ?? []) {
    const item = document.createElement("li");
    const link = makeText("a", "", page.name);
    link.href = page.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    item.append(link);
    list.append(item);
  }
  box.append(list);
  const rounds = feedback.filter((entry) => entry.gallery_id === gallery.id);
  box.append(makeText("small", "", `Séries de retours : ${rounds.length} envoyée${rounds.length > 1 ? "s" : ""} sur ${gallery.feedback_rounds} prévue${gallery.feedback_rounds > 1 ? "s" : ""}.`));
  for (const round of rounds) {
    const details = document.createElement("details");
    details.className = "admin-feedback";
    details.append(makeText("summary", "", `Série ${round.round} — ${new Date(round.submitted_at).toLocaleDateString("fr-FR")}`));
    for (const entry of round.entries) {
      const p = document.createElement("p");
      p.append(makeText("strong", "", `${entry.page}${entry.approved ? " — ✓ ça me convient" : ""}`));
      if (entry.comment) p.append(document.createElement("br"), entry.comment);
      details.append(p);
    }
    if (round.final_comment) {
      const p = document.createElement("p");
      p.append(makeText("strong", "", "Une dernière chose"), document.createElement("br"), round.final_comment);
      details.append(p);
    }
    box.append(details);
  }
  if (gallery.status !== "open") return box;
  const edit = makeText("button", "gallery-quiet-button", "Modifier les pages / séries");
  edit.type = "button";
  const form = document.createElement("form");
  form.hidden = true;
  const rows = document.createElement("div");
  for (const page of gallery.web_pages?.length ? gallery.web_pages : [{}]) rows.append(linkRow(WEB_FIELDS, page));
  const add = makeText("button", "gallery-quiet-button", "+ Ajouter une page");
  add.type = "button";
  add.addEventListener("click", () => rows.append(linkRow(WEB_FIELDS)));
  const roundsInput = document.createElement("input");
  roundsInput.className = "gallery-admin-input";
  roundsInput.type = "number"; roundsInput.min = "0"; roundsInput.max = "20";
  roundsInput.value = String(gallery.feedback_rounds);
  const roundsLabel = makeText("label", "gallery-admin-label", "Séries de modifications prévues");
  roundsLabel.append(roundsInput);
  const save = makeText("button", "gallery-primary-button", "Enregistrer");
  save.type = "submit";
  form.append(rows, add, roundsLabel, save);
  edit.addEventListener("click", () => { form.hidden = !form.hidden; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await callAdmin({ action: "set-web-pages", galleryId: gallery.id, webPages: readLinkRows(rows, WEB_FIELDS), feedbackRounds: Number(roundsInput.value) });
      await loadDashboard();
      setMessage(`Suivi de « ${gallery.name} » enregistré.`, false);
    } catch (error) {
      setMessage(error.message);
      save.disabled = false;
    }
  });
  box.append(edit, form);
  return box;
}

// Contenus réseaux : dossiers et guide PDF
function renderSocial(gallery) {
  const box = document.createElement("div");
  box.className = "admin-video-links";
  const list = document.createElement("ul");
  list.className = "admin-video-current";
  for (const folder of gallery.social_folders ?? []) {
    const item = document.createElement("li");
    const link = makeText("a", "", folder.label);
    link.href = folder.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    item.append(link);
    if (folder.description) item.append(` — ${folder.description}`);
    list.append(item);
  }
  box.append(list, makeText("small", "", gallery.tutorial_path ? "Guide PDF : déposé ✓" : "Guide PDF : pas encore déposé"));
  if (gallery.status !== "open") return box;
  const edit = makeText("button", "gallery-quiet-button", "Modifier les dossiers / le guide");
  edit.type = "button";
  const form = document.createElement("form");
  form.hidden = true;
  const rows = document.createElement("div");
  for (const folder of gallery.social_folders?.length ? gallery.social_folders : [{}]) rows.append(linkRow(SOCIAL_FIELDS, folder));
  const add = makeText("button", "gallery-quiet-button", "+ Ajouter un dossier");
  add.type = "button";
  add.addEventListener("click", () => rows.append(linkRow(SOCIAL_FIELDS)));
  const pdf = document.createElement("input");
  pdf.className = "gallery-admin-input";
  pdf.type = "file"; pdf.accept = "application/pdf";
  const pdfLabel = makeText("label", "gallery-admin-label", gallery.tutorial_path ? "Remplacer le guide PDF (facultatif)" : "Guide PDF (facultatif)");
  pdfLabel.append(pdf);
  const save = makeText("button", "gallery-primary-button", "Enregistrer");
  save.type = "submit";
  form.append(rows, add, pdfLabel, save);
  edit.addEventListener("click", () => { form.hidden = !form.hidden; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await callAdmin({ action: "set-social-folders", galleryId: gallery.id, socialFolders: readLinkRows(rows, SOCIAL_FIELDS) });
      if (pdf.files[0]) await uploadTutorial(gallery.id, pdf.files[0]);
      await loadDashboard();
      setMessage(`Contenus de « ${gallery.name} » enregistrés.`, false);
    } catch (error) {
      setMessage(error.message);
      save.disabled = false;
    }
  });
  box.append(edit, form);
  return box;
}

const deliverySelect = document.getElementById("admin-gallery-delivery");
const videoRows = document.getElementById("admin-video-rows");
const webRows = document.getElementById("admin-web-rows");
const socialRows = document.getElementById("admin-social-rows");
function syncDelivery() {
  const value = deliverySelect.value;
  document.getElementById("admin-video-links").hidden = value !== "video";
  document.getElementById("admin-web-fields").hidden = value !== "web";
  document.getElementById("admin-social-fields").hidden = value !== "social";
  document.getElementById("admin-gallery-tariff-field").hidden = value !== "photos";
  if (value === "video" && !videoRows.children.length) videoRows.append(videoRow());
  if (value === "web" && !webRows.children.length) webRows.append(linkRow(WEB_FIELDS));
  if (value === "social" && !socialRows.children.length) socialRows.append(linkRow(SOCIAL_FIELDS));
  // Suivi de site et contenus réseaux : jusqu'à 90 jours
  const long = value === "web" || value === "social";
  const days = document.getElementById("admin-gallery-days");
  days.max = long ? "90" : "15";
  document.getElementById("admin-gallery-days-label").textContent = `Accès (jours, maximum ${long ? 90 : 15})`;
  if (long && Number(days.value) === 15) days.value = "60";
  if (!long && Number(days.value) > 15) days.value = "15";
}
document.getElementById("admin-web-add").addEventListener("click", () => webRows.append(linkRow(WEB_FIELDS)));
document.getElementById("admin-social-add").addEventListener("click", () => socialRows.append(linkRow(SOCIAL_FIELDS)));
deliverySelect.addEventListener("change", syncDelivery);
document.getElementById("admin-video-add").addEventListener("click", () => videoRows.append(videoRow()));

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...values].map((value) => alphabet[value % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

let lastFeedback = [];
function renderGalleries(galleries) {
  galleryList.replaceChildren();
  const openGalleries = galleries.filter((gallery) =>
    gallery.status === "open" && Date.parse(gallery.expires_at) > Date.now()
  );
  photoGallerySelect.replaceChildren();
  for (const gallery of openGalleries.filter((entry) => !entry.delivery || entry.delivery === "photos")) {
    const option = document.createElement("option");
    option.value = gallery.id;
    option.textContent = `${gallery.name} — ${tariffLabel(gallery.tariff)}`;
    option.dataset.tariff = gallery.tariff;
    photoGallerySelect.append(option);
  }
  photoGallerySelect.disabled = photoGallerySelect.options.length === 0;
  updatePhotoUploadNote();
  if (!galleries.length) {
    galleryList.append(makeText("p", "gallery-admin-note", "Aucune galerie."));
    return;
  }
  for (const gallery of galleries) {
    const record = document.createElement("article");
    record.className = "gallery-admin-record";
    const header = document.createElement("div");
    header.className = "gallery-admin-record-header";
    header.append(
      makeText("strong", "", gallery.name),
      makeText(
        "span",
        `gallery-page-status${gallery.status === "closed" || Date.parse(gallery.expires_at) <= Date.now() ? " is-closed" : ""}`,
        gallery.status === "closed"
          ? "Fermée"
          : Date.parse(gallery.expires_at) <= Date.now()
            ? "Expirée"
            : "Ouverte"
      )
    );
    record.append(header);
    const closes = new Date(gallery.expires_at).toLocaleDateString("fr-FR");
    record.append(makeText("small", "", gallery.delivery === "web"
      ? `Suivi de site · ${gallery.web_pages?.length ?? 0} page(s) · ferme le ${closes}`
      : gallery.delivery === "social"
      ? `Contenus réseaux · ${gallery.social_folders?.length ?? 0} dossier(s) · ferme le ${closes}`
      : gallery.delivery === "video"
      ? `Livraison vidéo · ${gallery.video_links?.length ?? 0} lien${(gallery.video_links?.length ?? 0) > 1 ? "s" : ""} · ferme le ${new Date(gallery.expires_at).toLocaleDateString("fr-FR")}`
      : `${gallery.type === "event" ? "Événement partagé" : "Individuelle"} · ${tariffLabel(gallery.tariff)} · ferme le ${new Date(gallery.expires_at).toLocaleDateString("fr-FR")}`));
    record.append(renderAccessCode(gallery));
    if (gallery.delivery === "video") record.append(renderVideoLinks(gallery));
    if (gallery.delivery === "web") record.append(renderWebFollowUp(gallery, lastFeedback));
    if (gallery.delivery === "social") record.append(renderSocial(gallery));
    if (gallery.status === "open") {
      const button = makeText("button", "gallery-quiet-button", "Fermer cette galerie");
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await callAdmin({ action: "close-gallery", galleryId: gallery.id });
          await loadDashboard();
        } catch (error) {
          setMessage(error.message);
          button.disabled = false;
        }
      });
      record.append(button);
    }
    galleryList.append(record);
  }
}

function renderOrders(orders, orderPhotos, galleries) {
  orderList.replaceChildren();
  if (!orders.length) {
    orderList.append(makeText("p", "gallery-admin-note", "Aucune commande."));
    return;
  }
  const photosByOrder = new Map();
  const galleriesById = new Map(galleries.map((gallery) => [gallery.id, gallery.name]));
  for (const photo of orderPhotos) {
    const items = photosByOrder.get(photo.order_id) ?? [];
    items.push(String(photo.photo_number).padStart(3, "0"));
    photosByOrder.set(photo.order_id, items);
  }

  for (const order of orders) {
    const record = document.createElement("article");
    record.className = "gallery-admin-record";
    const statusLabels = {
      pending_payment: "En attente de paiement",
      paid_to_prepare: "Payée, à préparer",
      sent: "Envoyée",
      cancelled_refunded: "Annulée / remboursée"
    };
    const header = document.createElement("div");
    header.className = "gallery-admin-record-header";
    header.append(
      makeText("strong", "", statusLabels[order.status] || order.status),
      makeText("span", "", new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: order.currency.toUpperCase()
      }).format(order.total_cents / 100))
    );
    record.append(header);
    record.append(makeText("small", "", `${galleriesById.get(order.gallery_id) || "Galerie"} · ${order.customer_email} · photos ${(photosByOrder.get(order.id) || []).join(", ")} · ${new Date(order.created_at).toLocaleString("fr-FR")}`));

    if (order.status === "paid_to_prepare") {
      const button = makeText("button", "gallery-quiet-button", "Marquer comme envoyée");
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await callAdmin({ action: "update-order", orderId: order.id, status: "sent" });
          await loadDashboard();
        } catch (error) {
          setMessage(error.message);
          button.disabled = false;
        }
      });
      record.append(button);
      const cancelButton = makeText("button", "gallery-quiet-button", "Enregistrer comme annulée / remboursée");
      cancelButton.type = "button";
      cancelButton.addEventListener("click", async () => {
        if (!window.confirm("Effectuez d’abord tout remboursement nécessaire dans Stripe. Voulez-vous enregistrer ce statut ?")) return;
        cancelButton.disabled = true;
        try {
          await callAdmin({
            action: "update-order",
            orderId: order.id,
            status: "cancelled_refunded"
          });
          await loadDashboard();
        } catch (error) {
          setMessage(error.message);
          cancelButton.disabled = false;
        }
      });
      record.append(cancelButton);
    } else if (order.status === "pending_payment") {
      record.append(makeText("small", "gallery-admin-note", "Le statut payé est uniquement confirmé par le webhook Stripe."));
    }
    orderList.append(record);
  }
}

// Séances (devis acceptés, séances du planning) proposées pour lier une nouvelle galerie
async function loadSessions() {
  const select = document.getElementById("admin-gallery-session");
  try {
    const { sessions } = await callGalleryFunction("commerce-api", { body: { action: "list-sessions" }, accessToken });
    const current = select.value;
    select.replaceChildren(new Option("Aucune", ""), ...sessions.map((session) => new Option(
      `${new Date(`${session.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} — ${session.label}`,
      session.value
    )));
    select.value = current;
  } catch (error) {
    console.error("Séances indisponibles", error);
  }
}

async function loadDashboard() {
  loadSessions();
  const data = await callAdmin();
  const galleries = data.galleries || [];
  lastFeedback = data.feedback || [];
  renderGalleries(galleries);
  renderOrders(data.orders || [], data.orderPhotos || [], galleries);
  loginForm.hidden = true;
  dashboard.hidden = false;
  setMessage("", false);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    accessToken = await signIn(
      document.getElementById("admin-email").value.trim(),
      document.getElementById("admin-password").value
    );
    window.sessionStorage.setItem(accessTokenKey, accessToken);
    await loadDashboard();
  } catch (error) {
    setMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("admin-logout").addEventListener("click", () => {
  window.sessionStorage.removeItem(accessTokenKey);
  accessToken = null;
  dashboard.hidden = true;
  loginForm.hidden = false;
  setMessage("Vous êtes déconnecté.", false);
});

// Création : la vérification du navigateur est remplacée par la nôtre (formulaire en « novalidate »).
// Sur ordinateur, un champ refusé mais masqué (lien vidéo ou dossier d'un autre type de contenu, adresse
// sans « https:// »…) bloquait le bouton sans aucun message ; désormais chaque refus est expliqué à côté du bouton.
const createdCode = document.getElementById("admin-created-code");
function createError(text, field) {
  createdCode.textContent = text;
  createdCode.style.color = "#e6aaa2";
  // Connexion expirée : le formulaire de connexion réapparaît en haut, on y remonte.
  if (dashboard.hidden) setMessage(text);
  if (field && !field.closest("[hidden]")) field.focus({ preventScroll: true });
}
function checkCreateForm() {
  const name = document.getElementById("admin-gallery-name");
  if (!name.value.trim()) return createError("Indiquez le nom affiché de la galerie.", name), false;
  const days = document.getElementById("admin-gallery-days");
  const max = Number(days.max) || 15;
  const value = Number(days.value);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    return createError(`La durée d’accès doit être un nombre entier entre 1 et ${max} jours.`, days), false;
  }
  const code = document.getElementById("admin-gallery-code");
  // Tout caractère est permis (accents, signes, espaces) ; seule la longueur compte.
  const codeLength = [...code.value.trim()].length;
  if (codeLength < 3 || codeLength > 100) {
    return createError("Le code d’accès doit faire entre 3 et 100 caractères.", code), false;
  }
  const rows = { video: videoRows, web: webRows, social: socialRows }[deliverySelect.value];
  for (const input of rows ? rows.querySelectorAll('[data-field="url"]') : []) {
    const url = normalizeUrl(input.value);
    if (!url) continue;
    try { new URL(url); } catch {
      return createError(`Ce lien n’est pas une adresse valide : « ${input.value.trim()} ».`, input), false;
    }
  }
  return true;
}

document.getElementById("admin-create-gallery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  createdCode.textContent = "";
  createdCode.style.color = "";
  if (!checkCreateForm()) return;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Création…";
  const code = document.getElementById("admin-gallery-code").value.trim();
  try {
    const result = await callAdmin({
      action: "create-gallery",
      name: document.getElementById("admin-gallery-name").value.trim(),
      type: document.getElementById("admin-gallery-type").value,
      tariff: tariffSelect.value,
      daysOpen: Number(document.getElementById("admin-gallery-days").value),
      session: document.getElementById("admin-gallery-session").value,
      delivery: deliverySelect.value,
      videoLinks: deliverySelect.value === "video" ? readVideoRows(videoRows) : undefined,
      webPages: deliverySelect.value === "web" ? readLinkRows(webRows, WEB_FIELDS) : undefined,
      feedbackRounds: deliverySelect.value === "web" ? Number(document.getElementById("admin-web-rounds").value) : undefined,
      socialFolders: deliverySelect.value === "social" ? readLinkRows(socialRows, SOCIAL_FIELDS) : undefined,
      code
    });
    const pdfFile = document.getElementById("admin-social-pdf").files[0];
    if (deliverySelect.value === "social" && pdfFile && result.gallery?.id) {
      await uploadTutorial(result.gallery.id, pdfFile);
    }
    document.getElementById("admin-created-code").textContent =
      `Galerie créée. Communiquez maintenant le code ${result.accessCode} au client ; il n’est pas conservé en clair.`;
    form.reset();
    videoRows.replaceChildren();
    webRows.replaceChildren();
    socialRows.replaceChildren();
    syncDelivery();
    document.getElementById("admin-gallery-days").value = "15";
    await loadDashboard();
    document.getElementById("admin-created-code").textContent =
      `Galerie créée. Communiquez maintenant le code ${result.accessCode} au client ; il n’est pas conservé en clair.`;
  } catch (error) {
    createError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Créer la galerie";
  }
});

photoGallerySelect.addEventListener("change", updatePhotoUploadNote);

/* =========================
   Galerie payante : dépôt groupé et couplage par numéro
   Le numéro est la dernière suite de chiffres du nom de fichier (« ethan-001-wm.jpg » → 1).
   Un aperçu et un original qui portent le même numéro forment une paire ; ce numéro devient
   celui de la photo dans la galerie.
========================= */
const previewInput = document.getElementById("admin-photo-preview");
const originalInput = document.getElementById("admin-photo-original");
const pairsDetails = document.getElementById("admin-pairs");
const pairsTable = document.getElementById("admin-pairs-table");
const pairsSummary = document.getElementById("admin-pairs-summary");
const pairsSubmit = document.getElementById("admin-pairs-submit");
const paidProgress = document.getElementById("admin-paid-progress");
let previewFiles = [];
let originalFiles = [];
let thumbUrls = [];

function numberFromName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  const groups = base.match(/\d+/g);
  return groups ? Number(groups.at(-1)) : null;
}

function buildPairs() {
  const map = new Map();
  const add = (file, side) => {
    const number = numberFromName(file.name);
    const key = number ?? `sans-numero:${file.name}`;
    const entry = map.get(key) || { number, preview: [], original: [] };
    entry[side].push(file);
    map.set(key, entry);
  };
  previewFiles.forEach((file) => add(file, "preview"));
  originalFiles.forEach((file) => add(file, "original"));
  return [...map.values()]
    .map((entry) => {
      let problem = "";
      if (entry.number === null) problem = "aucun numéro dans le nom";
      else if (entry.number < 1) problem = "numéro invalide";
      else if (entry.preview.length > 1 || entry.original.length > 1) problem = "numéro en double";
      else if (!entry.preview.length) problem = "aperçu manquant";
      else if (!entry.original.length) problem = "original manquant";
      else if (entry.preview[0].size > 50 * 1024 * 1024 || entry.original[0].size > 50 * 1024 * 1024) problem = "fichier de plus de 50 Mo";
      return { ...entry, problem };
    })
    .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
}

function thumb(file) {
  const cell = document.createElement("div");
  cell.className = "admin-pair-file";
  if (!file) { cell.append(makeText("span", "admin-pair-missing", "—")); return cell; }
  const url = URL.createObjectURL(file);
  thumbUrls.push(url);
  const image = document.createElement("img");
  image.src = url;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  cell.append(image, makeText("span", "admin-pair-name", file.name));
  return cell;
}

function renderPairs() {
  const pairs = buildPairs();
  const ready = pairs.filter((pair) => !pair.problem);
  const issues = pairs.length - ready.length;
  document.getElementById("admin-preview-count").textContent = previewFiles.length ? `${previewFiles.length} fichier(s)` : "Aucun fichier";
  document.getElementById("admin-original-count").textContent = originalFiles.length ? `${originalFiles.length} fichier(s)` : "Aucun fichier";
  pairsSummary.textContent = pairs.length
    ? `Vérifier les associations — ${ready.length} paire(s) prête(s)${issues ? `, ${issues} à corriger` : ""}`
    : "Vérifier les associations";
  pairsSubmit.disabled = !ready.length;
  pairsSubmit.textContent = ready.length ? `Envoyer ${ready.length} photo(s)` : "Envoyer les photos";

  // Les miniatures ne sont créées que lorsque le panneau est ouvert.
  thumbUrls.forEach((url) => URL.revokeObjectURL(url));
  thumbUrls = [];
  pairsTable.replaceChildren();
  if (!pairsDetails.open) return;
  pairs.forEach((pair) => {
    const row = document.createElement("div");
    row.className = "admin-pair-row";
    row.dataset.kind = pair.problem ? "error" : "ok";
    row.append(
      makeText("span", "admin-pair-number", pair.number === null ? "?" : String(pair.number).padStart(3, "0")),
      thumb(pair.preview[0]),
      thumb(pair.original[0]),
      makeText("span", "admin-pair-status", pair.problem || "OK")
    );
    pairsTable.append(row);
  });
}

function addFiles(list, side) {
  const files = [...list].filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type));
  if (side === "preview") previewFiles = files; else originalFiles = files;
  paidProgress.replaceChildren();
  renderPairs();
}

previewInput.addEventListener("change", () => addFiles(previewInput.files, "preview"));
originalInput.addEventListener("change", () => addFiles(originalInput.files, "original"));
pairsDetails.addEventListener("toggle", renderPairs);
[["admin-preview-drop", "preview"], ["admin-original-drop", "original"]].forEach(([id, side]) => {
  const zone = document.getElementById(id);
  ["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((type) => zone.addEventListener(type, () => zone.classList.remove("is-over")));
  zone.addEventListener("drop", (event) => { event.preventDefault(); addFiles(event.dataTransfer.files, side); });
});

document.getElementById("admin-add-photos-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const galleryId = photoGallerySelect.value;
  if (!galleryId) { setMessage("Choisissez d’abord une galerie ouverte."); return; }
  if (photoGallerySelect.selectedOptions[0]?.dataset.tariff === "tarif0") return; // galerie gratuite : dépôt direct
  const pairs = buildPairs().filter((pair) => !pair.problem);
  if (!pairs.length) { setMessage("Aucune paire aperçu + original complète à envoyer."); return; }

  pairsSubmit.disabled = true;
  paidProgress.replaceChildren();
  setMessage(`Envoi de ${pairs.length} photo(s)… Gardez cette page ouverte.`, false);
  let done = 0, failed = 0;
  for (const pair of pairs) {
    const label = String(pair.number).padStart(3, "0");
    const row = makeText("li", "", `Photo ${label} — envoi…`);
    paidProgress.append(row);
    try {
      const upload = await callAdmin({
        action: "prepare-photo-upload",
        galleryId,
        photoNumber: pair.number,
        previewFileName: pair.preview[0].name,
        originalFileName: pair.original[0].name
      });
      await Promise.all([
        uploadSignedObject(upload.preview.bucket, upload.preview.path, upload.preview.token, pair.preview[0]),
        uploadSignedObject(upload.original.bucket, upload.original.path, upload.original.token, pair.original[0])
      ]);
      try {
        await callAdmin({
          action: "register-photo",
          galleryId,
          photoId: upload.photoId,
          photoNumber: pair.number,
          previewPath: upload.preview.path,
          originalPath: upload.original.path
        });
      } catch (error) {
        if (/n’a pas pu traiter la demande/.test(String(error.message))) throw new Error("ce numéro existe peut-être déjà dans la galerie");
        throw error;
      }
      row.textContent = `Photo ${label} — ajoutée`;
      row.dataset.kind = "done";
      done += 1;
    } catch (error) {
      row.textContent = `Photo ${label} — échec : ${error.message}`;
      row.dataset.kind = "error";
      failed += 1;
    }
  }
  previewFiles = [];
  originalFiles = [];
  previewInput.value = "";
  originalInput.value = "";
  renderPairs();
  await loadDashboard().catch(() => {});
  setMessage(`${done} photo(s) ajoutée(s)${failed ? `, ${failed} en échec (voir la liste)` : ""}.`, failed > 0);
});

if (accessToken) {
  // Déjà connecté : les cases de connexion restent masquées pendant le chargement.
  loginForm.hidden = true;
  loadDashboard().catch((error) => {
    window.sessionStorage.removeItem(accessTokenKey);
    accessToken = null;
    loginForm.hidden = false;
    setMessage(error.message);
  });
}


/* =========================
   Galerie gratuite : dépôt de plusieurs photos d'un coup
   Pour chaque photo : un aperçu allégé (2000 px max.) est préparé dans le navigateur pour l'affichage
   dans la galerie, et la photo d'origine est envoyée telle quelle pour le téléchargement.
   Numérotation automatique à partir du numéro choisi ; un numéro déjà pris est sauté.
========================= */
const PREVIEW_MAX = 2000;
const freeFilesInput = document.getElementById("admin-free-files");
const dropzone = document.getElementById("admin-dropzone");
const progressList = document.getElementById("admin-free-progress");
let freeQueueRunning = false;

async function makePreview(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, PREVIEW_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Aperçu impossible à préparer.");
  return new File([blob], "preview.jpg", { type: "image/jpeg" });
}

async function uploadFreePhoto(file, galleryId, wantedNumber, row) {
  row.textContent = `${file.name} — préparation de l’aperçu…`;
  const preview = await makePreview(file);
  row.textContent = `${file.name} — envoi…`;
  const upload = await callAdmin({
    action: "prepare-photo-upload",
    galleryId,
    photoNumber: wantedNumber,
    previewFileName: preview.name,
    originalFileName: file.name
  });
  await Promise.all([
    uploadSignedObject(upload.preview.bucket, upload.preview.path, upload.preview.token, preview),
    uploadSignedObject(upload.original.bucket, upload.original.path, upload.original.token, file)
  ]);
  // Enregistrement : si le numéro est déjà pris, le serveur refuse (message générique) et on essaie le suivant.
  // Seul le premier envoi peut avoir à sauter des numéros : les suivants repartent juste après.
  let number = wantedNumber;
  for (let attempt = 0; attempt < 500; attempt += 1, number += 1) {
    try {
      await callAdmin({
        action: "register-photo",
        galleryId,
        photoId: upload.photoId,
        photoNumber: number,
        previewPath: upload.preview.path,
        originalPath: upload.original.path
      });
      return number;
    } catch (error) {
      if (!/n’a pas pu traiter la demande|duplicate|unique|23505/i.test(String(error.message))) throw error;
      if (number === wantedNumber) row.textContent = `${file.name} — recherche d’un numéro libre…`;
    }
  }
  throw new Error("Aucun numéro libre trouvé.");
}

async function uploadFreeFiles(fileList) {
  const galleryId = photoGallerySelect.value;
  if (!galleryId) { setMessage("Choisissez d’abord une galerie ouverte."); return; }
  if (freeQueueRunning) { setMessage("Un envoi est déjà en cours, patientez jusqu’à la fin."); return; }
  const files = [...fileList].filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type));
  if (!files.length) { setMessage("Aucune photo JPG, PNG ou WebP dans la sélection."); return; }
  files.sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));

  freeQueueRunning = true;
  dropzone.classList.add("is-busy");
  progressList.replaceChildren();
  let next = Math.max(1, Number(document.getElementById("admin-free-start").value) || 1);
  let done = 0, failed = 0;
  setMessage(`Envoi de ${files.length} photo(s)… Gardez cette page ouverte.`, false);

  for (const file of files) {
    const row = document.createElement("li");
    progressList.append(row);
    if (file.size > 50 * 1024 * 1024) {
      row.textContent = `${file.name} — trop lourde (50 Mo max.), ignorée`;
      row.dataset.kind = "error";
      failed += 1;
      continue;
    }
    try {
      const number = await uploadFreePhoto(file, galleryId, next, row);
      row.textContent = `${file.name} — ajoutée (photo ${String(number).padStart(3, "0")})`;
      row.dataset.kind = "done";
      next = number + 1;
      done += 1;
    } catch (error) {
      row.textContent = `${file.name} — échec : ${error.message}`;
      row.dataset.kind = "error";
      failed += 1;
    }
  }

  document.getElementById("admin-free-start").value = next;
  freeQueueRunning = false;
  dropzone.classList.remove("is-busy");
  freeFilesInput.value = "";
  await loadDashboard().catch(() => {});
  setMessage(`${done} photo(s) ajoutée(s)${failed ? `, ${failed} en échec (voir la liste)` : ""}.`, failed > 0);
}

freeFilesInput.addEventListener("change", () => uploadFreeFiles(freeFilesInput.files));
["dragenter", "dragover"].forEach((type) => dropzone.addEventListener(type, (event) => {
  event.preventDefault();
  dropzone.classList.add("is-over");
}));
["dragleave", "drop"].forEach((type) => dropzone.addEventListener(type, () => dropzone.classList.remove("is-over")));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadFreeFiles(event.dataTransfer.files);
});
