import { callGalleryFunction } from "./galeries-api.js";

// Suivi de site web (espace client) : chaque page du site en cours s'affiche dans un cadre.
// Sous chaque page : un commentaire, ou « Ça me convient ». L'envoi n'est possible que lorsque
// toutes les pages sont commentées ou validées ; un dernier commentaire général est possible.
const $ = (id) => document.getElementById(id);
const state = { pages: [], answers: [], current: 0, galleryId: "", roundsLeft: 0, expectingLoad: false, signalled: false };

// ---- Navigation dans le cadre : seules les pages prévues (boutons au-dessus) sont accessibles.
// Même site : les clics sont interceptés directement. Autre site : le site en cours peut inclure
// https://alexandrepalanca.fr/apercu.js pour signaler ses clics ; sans ce script, toute navigation
// dans le cadre est annulée.
function samePage(a, b) {
  const clean = (value) => {
    try {
      const url = new URL(value, window.location.href);
      return `${url.origin}${url.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "").replace(/\/$/, "")}`;
    } catch { return String(value); }
  };
  return clean(a) === clean(b);
}
function pageIndexOf(url) {
  return state.pages.findIndex((page) => samePage(page.url, url));
}
let blockTimer;
function showBlocked() {
  const box = $("site-blocked");
  box.hidden = false;
  clearTimeout(blockTimer);
  blockTimer = setTimeout(() => { box.hidden = true; }, 4500);
}
function goTo(url) {
  const index = pageIndexOf(url);
  if (index === state.current) return;
  if (index >= 0) {
    openPage(index);
  } else {
    showBlocked();
  }
}
function reloadCurrent() {
  const frame = $("site-frame");
  state.expectingLoad = true;
  frame.src = state.pages[state.current].url;
  frame.dataset.url = state.pages[state.current].url;
}
// Même site : interception des clics sur les liens, avant toute navigation
function guardFrame(frame) {
  let doc;
  try { doc = frame.contentWindow.document; } catch { return false; }
  if (!doc || doc.__apercuGuard) return true;
  doc.__apercuGuard = true;
  frame.contentWindow.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (href.startsWith("#") || /^(mailto|tel):/i.test(href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    goTo(link.href);
  }, true);
  return true;
}
function onFrameLoad() {
  const frame = $("site-frame");
  if (state.expectingLoad) {
    state.expectingLoad = false;
    state.signalled = false;
    guardFrame(frame);
    return;
  }
  // Navigation non prévue dans le cadre
  let url = null;
  try { url = frame.contentWindow.location.href; } catch { /* autre site : adresse illisible */ }
  if (url) {
    const index = pageIndexOf(url);
    if (index >= 0 && index !== state.current) {
      state.current = index;
      frame.dataset.url = state.pages[index].url;
      openPage(index);
      guardFrame(frame);
      return;
    }
    if (index === state.current) { guardFrame(frame); return; }
  }
  if (state.signalled) { state.signalled = false; return; }
  showBlocked();
  reloadCurrent();
}
// Autre site équipé d'apercu.js : il demande la permission avant de changer de page
window.addEventListener("message", (event) => {
  const frame = $("site-frame");
  if (event.source !== frame.contentWindow || event.data?.type !== "apercu-navigation") return;
  state.signalled = true;
  setTimeout(() => { state.signalled = false; }, 1500);
  goTo(String(event.data.url || ""));
});
const draftKey = () => `suivi-site-${state.galleryId}`;

function saveDraft() {
  try {
    localStorage.setItem(draftKey(), JSON.stringify({ answers: state.answers, final: $("site-final").value }));
  } catch { /* brouillon facultatif */ }
}
function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey()) || "null");
    if (draft?.answers?.length === state.pages.length) state.answers = draft.answers;
    if (draft?.final) $("site-final").value = draft.final;
  } catch { /* brouillon facultatif */ }
}
const done = (answer) => answer.approved || answer.comment.trim().length > 0;

function showError(text) {
  $("site-title").textContent = "Suivi indisponible";
  $("site-error").textContent = text;
  $("site-error").hidden = false;
}

function renderPages() {
  $("site-pages").replaceChildren(...state.pages.map((page, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "site-page-pill";
    button.setAttribute("aria-current", String(index === state.current));
    button.textContent = page.name;
    if (done(state.answers[index])) button.dataset.done = state.answers[index].approved ? "ok" : "comment";
    button.addEventListener("click", () => openPage(index));
    return button;
  }));
  const count = state.answers.filter(done).length;
  $("site-progress").textContent = `${count} page${count > 1 ? "s" : ""} sur ${state.pages.length} complétée${count > 1 ? "s" : ""}`
    + (count < state.pages.length ? " — pour chaque page, laissez un commentaire ou cochez « Ça me convient »." : " — vous pouvez envoyer vos retours.");
  $("site-send").disabled = count < state.pages.length || state.roundsLeft <= 0;
}

function openPage(index) {
  state.current = index;
  const page = state.pages[index];
  const frame = $("site-frame");
  if (frame.dataset.url !== page.url) {
    state.expectingLoad = true;
    frame.src = page.url;
    frame.dataset.url = page.url;
  }
  $("site-blocked").hidden = true;
  $("site-open").href = page.url;
  $("site-comment-label").textContent = `Votre commentaire sur la page « ${page.name} »`;
  $("site-comment").value = state.answers[index].comment;
  $("site-approve").checked = state.answers[index].approved;
  $("site-next").hidden = index >= state.pages.length - 1;
  renderPages();
}

function renderHistory(feedback) {
  if (!feedback.length) return;
  $("site-history").hidden = false;
  $("site-history-list").replaceChildren(...feedback.map((round) => {
    const box = document.createElement("details");
    box.className = "site-history-round";
    const summary = document.createElement("summary");
    summary.textContent = `Série ${round.round} — envoyée le ${new Date(round.submitted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
    box.append(summary);
    for (const entry of round.entries) {
      const p = document.createElement("p");
      const name = document.createElement("strong");
      name.textContent = `${entry.page}${entry.approved ? " — ✓ ça me convient" : ""}`;
      p.append(name);
      if (entry.comment) p.append(document.createElement("br"), entry.comment);
      box.append(p);
    }
    if (round.final_comment) {
      const p = document.createElement("p");
      const name = document.createElement("strong");
      name.textContent = "Une dernière chose";
      p.append(name, document.createElement("br"), round.final_comment);
      box.append(p);
    }
    return box;
  }));
}

async function start() {
  let data;
  try {
    data = await callGalleryFunction("gallery-data", { method: "GET" });
  } catch (error) {
    return showError(`${error.message} Saisissez à nouveau votre code dans l’espace client.`);
  }
  if (data.gallery?.delivery !== "web") return showError("Ce code ne correspond pas à un suivi de site.");
  state.galleryId = data.gallery.id;
  state.pages = data.pages;
  state.answers = data.pages.map(() => ({ approved: false, comment: "" }));
  state.roundsLeft = data.roundsIncluded - data.feedback.length;
  document.title = `${data.gallery.name} — Suivi de site`;
  $("site-title").textContent = data.gallery.name;
  $("site-intro").textContent = "Parcourez chaque page avec les boutons ci-dessous. Faites défiler la page dans le cadre, puis laissez un commentaire ou cochez « Ça me convient ».";
  const round = $("site-round");
  round.hidden = false;
  round.textContent = state.roundsLeft > 0
    ? `Série de modifications ${data.feedback.length + 1} sur ${data.roundsIncluded}`
    : `Les ${data.roundsIncluded} séries de modifications prévues ont été utilisées : contactez Elisa pour la suite.`;
  renderHistory(data.feedback);
  if (!state.pages.length) return showError("Les pages de votre site seront bientôt disponibles.");
  loadDraft();
  $("site-review").hidden = false;
  openPage(0);
}

$("site-frame").addEventListener("load", onFrameLoad);
$("site-blocked-close").addEventListener("click", () => { $("site-blocked").hidden = true; });

$("site-comment").addEventListener("input", (event) => {
  state.answers[state.current].comment = event.target.value;
  renderPages();
  saveDraft();
});
$("site-approve").addEventListener("change", (event) => {
  state.answers[state.current].approved = event.target.checked;
  renderPages();
  saveDraft();
});
$("site-final").addEventListener("input", saveDraft);
$("site-next").addEventListener("click", () => {
  openPage(Math.min(state.current + 1, state.pages.length - 1));
  $("site-pages").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelectorAll("[data-device]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-device]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  $("site-frame-wrap").classList.toggle("is-mobile", button.dataset.device === "mobile");
}));

$("site-send").addEventListener("click", async () => {
  const button = $("site-send");
  const message = $("site-message");
  button.disabled = true;
  message.textContent = "";
  message.removeAttribute("data-kind");
  try {
    const result = await callGalleryFunction("web-feedback", {
      body: { entries: state.answers, finalComment: $("site-final").value }
    });
    try { localStorage.removeItem(draftKey()); } catch { /* rien */ }
    message.dataset.kind = "success";
    message.textContent = `Merci ! Vos retours ont bien été envoyés à Elisa (série ${result.round}).`;
    $("site-review").hidden = true;
    $("site-intro").textContent = `Merci ! Vos retours ont bien été envoyés à Elisa (série ${result.round}). Elle revient vers vous avec la nouvelle version.`;
    $("site-round").textContent = result.roundsLeft > 0
      ? `Il vous reste ${result.roundsLeft} série${result.roundsLeft > 1 ? "s" : ""} de modifications.`
      : "Toutes les séries de modifications prévues ont été utilisées.";
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});

start();
