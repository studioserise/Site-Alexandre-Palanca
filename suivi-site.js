import { callGalleryFunction } from "./galeries-api.js";

// Suivi de site web (espace client) : chaque page du site en cours s'affiche dans un cadre.
// Sous chaque page : un commentaire, ou « Ça me convient ». L'envoi n'est possible que lorsque
// toutes les pages sont commentées ou validées ; un dernier commentaire général est possible.
const $ = (id) => document.getElementById(id);
const state = { pages: [], answers: [], current: 0, galleryId: "", roundsLeft: 0 };

// ---- Navigation libre dans l'aperçu : le client peut suivre tous les liens du site.
// Les deux vues (ordinateur, téléphone) restent sur la même page. Quand la page atteinte fait partie
// des pages prévues (boutons au-dessus), son commentaire et « Ça me convient » s'affichent.
// Même site : l'adresse de la page est lue directement ; autre site : apercu.js la signale.
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
function frameUrl(frame) {
  try { return frame.contentWindow.location.href; } catch { return null; }
}
function loadFrame(frame, url) {
  if (frame.dataset.url && samePage(frame.dataset.url, url)) return;
  frame.dataset.url = url;
  frame.src = url;
}
// Page atteinte dans une vue : l'autre vue la suit, et la page prévue correspondante devient la page en cours
function followNavigation(frame, url) {
  if (!url || url === "about:blank") return;
  frame.dataset.url = url;
  loadFrame(otherFrame(frame), url);
  $("site-open").href = url;
  const index = pageIndexOf(url);
  if (index >= 0 && index !== state.current) showPage(index);
}
function onFrameLoad(event) {
  const frame = event.currentTarget;
  linkScroll(frame);
  followNavigation(frame, frameUrl(frame));
}

// ---- Défilement synchronisé : faire défiler une vue fait défiler l'autre à la même proportion
// de la page (les deux versions n'ont pas la même hauteur). Même site : accès direct au cadre ;
// autre site : grâce à apercu.js (messages « apercu-scroll » / « apercu-scroll-to »).
const frames = () => [$("site-frame"), $("site-frame-mobile")];
const otherFrame = (frame) => frames().find((entry) => entry !== frame);
let scrollLeader = null;
let scrollTimer;
function scrollRatio(win) {
  const doc = win.document.scrollingElement || win.document.documentElement;
  const max = doc.scrollHeight - win.innerHeight;
  return max > 0 ? win.scrollY / max : 0;
}
function mirrorScroll(target, ratio) {
  try {
    const win = target.contentWindow;
    const doc = win.document.scrollingElement || win.document.documentElement;
    win.scrollTo(0, ratio * Math.max(0, doc.scrollHeight - win.innerHeight));
  } catch {
    target.contentWindow?.postMessage({ type: "apercu-scroll-to", ratio }, "*");
  }
}
function followScroll(source, ratio) {
  if (scrollLeader && scrollLeader !== source) return; // défilement provoqué par la synchronisation
  scrollLeader = source;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { scrollLeader = null; }, 180);
  if (source === $("site-frame-mobile") && $("site-phone").hidden) return;
  mirrorScroll(otherFrame(source), ratio);
}
function linkScroll(frame) {
  let win;
  try { win = frame.contentWindow; if (!win.document) return; } catch { return; }
  if (win.__apercuScroll) return;
  win.__apercuScroll = true;
  win.addEventListener("scroll", () => followScroll(frame, scrollRatio(win)), { passive: true });
}

// Autre site équipé d'apercu.js : il signale la page affichée et son défilement.
// (« apercu-navigation » : ancienne version du script, qui retenait les clics : la page demandée est ouverte.)
window.addEventListener("message", (event) => {
  const frame = frames().find((entry) => entry.contentWindow === event.source);
  if (!frame) return;
  const url = String(event.data?.url || "");
  if (event.data?.type === "apercu-scroll") followScroll(frame, Number(event.data.ratio) || 0);
  else if (event.data?.type === "apercu-location") followNavigation(frame, url);
  else if (event.data?.type === "apercu-navigation" && url) {
    frame.dataset.url = "";
    loadFrame(frame, url);
    followNavigation(frame, url);
  }
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

// Bouton d'une page prévue : les deux vues l'affichent
function openPage(index) {
  const page = state.pages[index];
  loadFrame($("site-frame"), page.url);
  loadFrame($("site-frame-mobile"), page.url);
  $("site-open").href = page.url;
  showPage(index);
}
// Commentaire, « Ça me convient » et boutons de la page prévue en cours
function showPage(index) {
  state.current = index;
  const page = state.pages[index];
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
  $("site-intro").textContent = "Parcourez chaque page avec les boutons ci-dessous. Faites défiler la page dans la vue ordinateur : la version téléphone, en bas à droite, défile en même temps. Puis laissez un commentaire ou cochez « Ça me convient ».";
  // Mot de l'administrateur : présentation du travail, instructions
  if (data.intro) {
    $("site-note").textContent = data.intro;
    $("site-note").hidden = false;
  }
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
// Écrans réalistes : le site s'affiche à la taille réelle de l'appareil, puis est réduit.
// Ordinateur : 1440 × 900 ; téléphone : 390 × 844 (proportions d'un téléphone actuel).
// L'ensemble (ordinateur + téléphone en bas à droite) tient toujours dans la fenêtre, sans être coupé.
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
function fitFrames() {
  const stage = $("site-stage");
  const wrap = $("site-frame-wrap");
  const phone = $("site-phone");
  const showPhone = !phone.hidden;
  const availableWidth = stage.parentElement.clientWidth;
  const navHeight = document.getElementById("site-nav")?.offsetHeight || 80;
  const availableHeight = Math.max(240, window.innerHeight - navHeight - 48);
  const ratio = DESKTOP.height / DESKTOP.width;
  // Téléphone : 78 % de la hauteur de l'écran d'ordinateur, débordant un peu à droite et en bas
  const PHONE_SHARE = 0.78;
  const phoneWidthShare = PHONE_SHARE * ratio * (PHONE.width / PHONE.height);
  const width = showPhone
    ? Math.min(availableWidth / (1 + 0.3 * phoneWidthShare), availableHeight / (ratio * (1 + 0.14 * PHONE_SHARE)))
    : Math.min(availableWidth, availableHeight / ratio);
  const height = width * ratio;
  wrap.style.width = `${width}px`;
  wrap.style.height = `${height}px`;
  const desktop = $("site-frame");
  desktop.style.width = `${DESKTOP.width}px`;
  desktop.style.height = `${DESKTOP.height}px`;
  desktop.style.transform = `scale(${wrap.clientWidth / DESKTOP.width})`;
  if (!showPhone) {
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    return;
  }
  const outerHeight = height * PHONE_SHARE;
  const bezel = Math.max(4, Math.round(outerHeight * 0.022));
  const screenHeight = outerHeight - 2 * bezel;
  const screenWidth = screenHeight * (PHONE.width / PHONE.height);
  const outerWidth = screenWidth + 2 * bezel;
  phone.style.width = `${outerWidth}px`;
  phone.style.height = `${outerHeight}px`;
  phone.style.borderWidth = `${bezel}px`;
  phone.style.borderRadius = `${Math.round(outerWidth * 0.16)}px`;
  const mobile = $("site-frame-mobile");
  mobile.style.width = `${PHONE.width}px`;
  mobile.style.height = `${PHONE.height}px`;
  mobile.style.transform = `scale(${screenWidth / PHONE.width})`;
  stage.style.width = `${width + outerWidth * 0.3}px`;
  stage.style.height = `${height + outerHeight * 0.14}px`;
}
$("site-phone-toggle").addEventListener("click", (event) => {
  const phone = $("site-phone");
  phone.hidden = !phone.hidden;
  event.currentTarget.setAttribute("aria-pressed", String(!phone.hidden));
  event.currentTarget.textContent = phone.hidden ? "Afficher la version téléphone" : "Masquer la version téléphone";
  fitFrames();
  if (!phone.hidden) {
    try { mirrorScroll($("site-frame-mobile"), scrollRatio($("site-frame").contentWindow)); } catch { /* autre site */ }
  }
});
new ResizeObserver(fitFrames).observe($("site-stage").parentElement);
window.addEventListener("resize", fitFrames);
$("site-frame-mobile").addEventListener("load", onFrameLoad);

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
