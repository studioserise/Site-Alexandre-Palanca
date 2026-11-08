import { getConfig } from "./galeries-config.js?v=2";

// Page « Répondre à la proposition » : le client accepte ou refuse son devis.
const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(window.location.search).get("t") || "";
const money = (cents) => `${((cents || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const dateFr = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");

const summary = $("q-summary");
const acceptForm = $("accept-form");
const refuseForm = $("refuse-form");

async function call(body) {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/quote-response`, {
    method: "POST",
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Une erreur est survenue. Réessayez dans un instant.");
  return result;
}

function finish(title, text) {
  $("q-title").textContent = title;
  $("q-intro").textContent = text;
  summary.hidden = true;
  acceptForm.hidden = true;
  refuseForm.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function show(part) {
  summary.hidden = part !== "summary";
  acceptForm.hidden = part !== "accept";
  refuseForm.hidden = part !== "refuse";
  $("q-intro").hidden = part !== "summary";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncType() {
  const pro = acceptForm.elements.type.value === "professionnel";
  $("pro-fields").hidden = !pro;
  $("name-label").textContent = pro ? "Nom de la société *" : "Nom et prénom *";
}

const STATES = {
  accepted: ["Devis accepté", "Ce devis a déjà été accepté. Merci ! Alexandre revient vers vous très vite."],
  refused: ["Réponse enregistrée", "Ce devis a déjà reçu une réponse. Pour toute question, répondez simplement à l'e-mail reçu."],
  expired: ["Devis expiré", "La date de validité de ce devis est dépassée. Répondez à l'e-mail reçu pour en obtenir un nouveau."],
  closed: ["Devis indisponible", "Ce devis n'attend plus de réponse. Pour toute question, répondez simplement à l'e-mail reçu."]
};

async function start() {
  if (!token) {
    finish("Lien incomplet", "Ouvrez la page avec le bouton « Répondre à la proposition » de l'e-mail reçu.");
    return;
  }
  let data;
  try {
    data = await call({ action: "get" });
  } catch (error) {
    finish("Lien invalide", error.message);
    return;
  }
  const q = data.quote;
  $("q-eyebrow").textContent = `Devis ${q.number}`;
  document.title = `Devis ${q.number} — Alexandre Palanca`;
  if (data.state !== "open") {
    finish(...STATES[data.state]);
    return;
  }
  $("q-intro").textContent = "Prenez connaissance du devis joint à l'e-mail, puis donnez votre réponse ci-dessous.";
  const facts = [
    ["Montant total", money(q.totalCents)],
    ...(q.depositCents ? [["Acompte à la réservation", money(q.depositCents)]] : []),
    ...(q.servicePeriod ? [["Date de la prestation", q.servicePeriod]] : []),
    ...(q.validUntil ? [["Valable jusqu'au", dateFr(q.validUntil)]] : [])
  ];
  $("q-facts").replaceChildren(...facts.flatMap(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
  $("q-items").replaceChildren(...data.items.map((item) => {
    const li = document.createElement("li");
    li.textContent = item.title;
    return li;
  }));
  $("deposit-note").textContent = q.depositCents
    ? `En confirmant, vous acceptez le devis ${q.number}. Un acompte de ${money(q.depositCents)} vous sera demandé pour réserver la prestation.`
    : `En confirmant, vous acceptez le devis ${q.number}.`;

  // Cases déjà connues pré-remplies
  const c = data.client;
  for (const key of ["name", "email", "phone", "address", "postalCode", "city", "country", "siret", "vatNumber"]) {
    acceptForm.elements[key].value = c[key] || "";
  }
  acceptForm.elements.type.value = c.type;
  syncType();
  show("summary");
}

$("q-accept").addEventListener("click", () => show("accept"));
$("q-refuse").addEventListener("click", () => show("refuse"));
document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => show("summary")));
acceptForm.querySelectorAll('input[name="type"]').forEach((input) => input.addEventListener("change", syncType));
$("add-comment").addEventListener("click", () => {
  $("add-comment").hidden = true;
  $("accept-comment-field").hidden = false;
  acceptForm.elements.comment.focus();
});

async function submit(form, body, done) {
  const message = form.querySelector(".gallery-form-message");
  const button = form.querySelector('button[type="submit"]');
  message.textContent = "";
  button.disabled = true;
  try {
    await call(body);
    done();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

acceptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const f = acceptForm.elements;
  const pro = f.type.value === "professionnel";
  const missing = ["name", "email", "address", "postalCode", "city", ...(pro ? ["siret"] : [])]
    .filter((key) => !f[key].value.trim());
  const message = acceptForm.querySelector(".gallery-form-message");
  if (missing.length) {
    message.textContent = "Merci de remplir les champs marqués d'une étoile.";
    f[missing[0]].focus();
    return;
  }
  const client = Object.fromEntries(
    ["name", "email", "phone", "address", "postalCode", "city", "country", "siret", "vatNumber"].map((key) => [key, f[key].value.trim()])
  );
  submit(acceptForm, { action: "accept", client: { ...client, type: f.type.value }, comment: f.comment.value.trim() },
    () => finish("Merci, devis accepté !", "Votre réponse a bien été transmise. Alexandre revient vers vous très vite avec la facture d'acompte et la suite."));
});

refuseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const f = refuseForm.elements;
  const redo = f.redo.checked;
  submit(refuseForm, { action: "refuse", redo, comment: f.comment.value.trim() },
    () => finish("Réponse envoyée", redo
      ? "Merci pour votre retour. Alexandre vous préparera un nouveau devis en tenant compte de vos remarques."
      : "Merci pour votre retour. N'hésitez pas à revenir vers nous pour un prochain projet."));
});

start();
