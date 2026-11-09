import { getConfig } from "./galeries-config.js?v=2";

// Paiement de l'acompte (p=acompte) ou du solde (p=solde) d'un devis accepté : par carte (Stripe) ou par virement.
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const token = params.get("t") || "";
const part = params.get("p") === "acompte" ? "acompte" : "solde";
const money = (cents) => `${((cents || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const dateFr = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");

async function call(body) {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/quote-payment`, {
    method: "POST",
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token, part })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Une erreur est survenue. Réessayez dans un instant.");
  return result;
}

function say(title, text) {
  $("p-title").textContent = title;
  $("p-intro").textContent = text;
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  button.textContent = "Copié ✓";
  button.classList.add("is-copied");
  setTimeout(() => { button.textContent = "Copier"; button.classList.remove("is-copied"); }, 1800);
}

function row(label, shown, copied) {
  const box = document.createElement("div");
  box.className = "transfer-row";
  const title = document.createElement("span");
  title.textContent = label;
  const value = document.createElement("strong");
  value.textContent = shown;
  box.append(title, value);
  if (copied) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Copier";
    button.addEventListener("click", () => copy(copied, button));
    box.append(button);
  }
  return box;
}

async function start() {
  if (!token) return say("Lien incomplet", "Ouvrez cette page avec le bouton reçu par e-mail.");
  if (params.get("ok") === "1") {
    return say("Merci, paiement reçu !", "Votre paiement par carte a bien été effectué. Vous recevrez un reçu par e-mail, et le règlement est enregistré sur votre facture.");
  }
  let data;
  try {
    data = await call({ action: "get" });
  } catch (error) {
    return say("Fiche indisponible", error.message);
  }
  $("p-eyebrow").textContent = `Devis ${data.number}${data.holder ? ` · ${data.holder}` : ""}`;
  if (data.amountCents <= 0) {
    return say(part === "acompte" ? "Acompte réglé" : "Tout est réglé", part === "acompte"
      ? "L'acompte de ce devis est déjà réglé. Merci !"
      : "Ce devis est déjà entièrement réglé. Merci !");
  }
  say(part === "acompte" ? "Régler l'acompte" : "Régler le solde", part === "acompte"
    ? `L'acompte confirme la réservation de votre date.${data.dueDate ? ` Merci de le régler au plus tard le ${dateFr(data.dueDate)}.` : ""}`
    : "Le solde peut être réglé dès maintenant par carte ou par virement, ou sur place le jour même (espèces ou virement).");
  $("p-card").textContent = `Payer ${money(data.amountCents)} par carte`;
  // Carte proposée seulement si le prestataire l'accepte ; sinon, virement uniquement
  if (!data.cardAvailable) {
    document.querySelector(".pay-card").hidden = true;
    document.querySelector(".pay-or").hidden = true;
  }
  const facts = [
    ["Client", data.clientName],
    ...(data.invoiceNumber ? [[part === "acompte" ? "Facture d'acompte" : "Facture", data.invoiceNumber]] : []),
    ...(data.serviceDate ? [["Prestation", dateFr(data.serviceDate)]] : [])
  ];
  $("p-facts").replaceChildren(...facts.flatMap(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
  const euros = (data.amountCents / 100).toFixed(2).replace(".", ",");
  if (!data.iban) {
    $("p-transfer").replaceChildren(row("Coordonnées de virement", "Bientôt disponibles : répondez à l'e-mail reçu pour les obtenir."));
    $("p-done").hidden = true;
  } else $("p-transfer").replaceChildren(
    row("Montant", money(data.amountCents), euros),
    row("Bénéficiaire", data.holder, data.holder),
    row("IBAN", data.iban, data.iban.replace(/\s+/g, "")),
    ...(data.bic ? [row("BIC", data.bic, data.bic)] : []),
    row("Référence à indiquer dans le libellé", data.reference, data.reference)
  );
  $("p-sheet").hidden = false;
  if (data.notifiedAt) markDone();
}

function markDone() {
  const button = $("p-done");
  button.disabled = true;
  button.textContent = "Virement signalé ✓";
  const message = $("p-message");
  message.dataset.kind = "success";
  message.textContent = "Merci ! Alexandre vous confirmera la bonne réception du virement.";
}

$("p-card").addEventListener("click", async () => {
  const button = $("p-card");
  button.disabled = true;
  $("p-card-message").textContent = "";
  try {
    const { url } = await call({ action: "checkout" });
    window.location.href = url;
  } catch (error) {
    $("p-card-message").textContent = error.message;
    button.disabled = false;
  }
});

$("p-done").addEventListener("click", async () => {
  const button = $("p-done");
  button.disabled = true;
  $("p-message").textContent = "";
  try {
    await call({ action: "notify" });
    markDone();
  } catch (error) {
    $("p-message").textContent = error.message;
    button.disabled = false;
  }
});

start();
