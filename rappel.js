import { getConfig } from "./galeries-config.js?v=2";

// Page de validation d'un rappel (lien reçu par Alex) : relire, modifier, envoyer au client.
const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(window.location.search).get("t") || "";
const form = $("r-form");

async function call(body) {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/quote-reminders`, {
    method: "POST",
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Une erreur est survenue. Réessayez dans un instant.");
  return result;
}

function say(title, text) {
  $("r-title").textContent = title;
  $("r-intro").textContent = text;
  $("r-intro").hidden = false;
}

async function start() {
  if (!token) return say("Lien incomplet", "Ouvrez cette page avec le bouton reçu par e-mail.");
  let data;
  try {
    data = await call({ action: "get" });
  } catch (error) {
    return say("Lien invalide", error.message);
  }
  $("r-eyebrow").textContent = `Devis ${data.number} · ${data.kindLabel}`;
  if (data.sentAt) {
    return say("Rappel déjà envoyé", `Ce rappel a été envoyé à ${data.clientName} le ${new Date(data.sentAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}.`);
  }
  say("Rappel à valider", "Relisez le message, modifiez-le si besoin, puis envoyez-le au client.");
  const facts = [["Client", data.clientName], ["E-mail", data.to], ["Rendez-vous", data.when]];
  $("r-facts").replaceChildren(...facts.flatMap(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
  form.elements.message.value = data.message;
  $("r-pay").textContent = data.payButton
    ? `Le bouton « ${data.payButton} » sera ajouté sous le message.`
    : "Rien ne reste à payer : aucun bouton de paiement ne sera ajouté.";
  form.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const message = form.querySelector(".gallery-form-message");
  message.textContent = "";
  button.disabled = true;
  try {
    await call({ action: "send", message: form.elements.message.value });
    form.hidden = true;
    say("Rappel envoyé", "Le client a bien reçu le rappel. Merci !");
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});

start();
