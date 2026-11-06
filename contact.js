import { getConfig } from "./galeries-config.js?v=2";

const contactForm = document.getElementById("contact-form");
const contactStatus = document.getElementById("contact-form-status");
const contactSubmit = document.getElementById("contact-submit");
const config = getConfig();

const contactService = document.getElementById("contact-service");
const requestedService = new URLSearchParams(window.location.search).get("service");
if (requestedService && contactService instanceof HTMLSelectElement && [...contactService.options].some((option) => option.value === requestedService)) {
  contactService.value = requestedService;
}
if (requestedService === "Sites internet") {
  document.getElementById("contact-title").textContent = "Parlons de votre projet web.";
  document.getElementById("contact-description").textContent = "Décrivez-nous votre activité et vos besoins pour imaginer un site internet adapté à votre projet.";
}

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  contactStatus.textContent = "";
  delete contactStatus.dataset.kind;

  // Aucun champ n'est bloquant : la demande part toujours, l'échange avec Alex clarifiera le reste.

  const formData = new FormData(contactForm);
  const extras = [];
  contactForm.querySelectorAll("select[data-extra]").forEach((select) => {
    if (select.value) extras.push(`${select.labels[0].textContent.trim()} : ${select.value}`);
  });
  contactForm.querySelectorAll("fieldset.contact-chips").forEach((group) => {
    const values = [...group.querySelectorAll("input:checked")].map((input) => input.value);
    if (values.length) extras.push(`${group.querySelector("legend").textContent.trim()} : ${values.join(", ")}`);
  });
  const details = extras.length ? `${formData.get("message")}\n\n— Précisions —\n${extras.join("\n")}` : formData.get("message");
  const payload = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    service: formData.get("service"),
    type: formData.get("type") || "",
    date: formData.get("date"),
    message: details,
    consent: formData.get("consent") === "on",
    website: formData.get("website")
  };

  contactSubmit.disabled = true;
  contactSubmit.querySelector("span").textContent = "Envoi en cours…";

  // Au-delà de 20 secondes sans réponse, on considère que l'envoi a échoué.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 20000);
  try {
    const response = await fetch(
      `${config.supabaseUrl}/functions/v1/contact-request`,
      {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: timeout.signal
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    contactForm.reset();
    contactStatus.dataset.kind = "success";
    contactStatus.textContent = "Votre demande a bien été envoyée. Merci, je reviendrai vers vous dès que possible.";
  } catch (error) {
    // Seul cas d'erreur montré au visiteur : la demande n'a pas pu partir. Le formulaire garde ce qu'il a écrit.
    console.error("Envoi du formulaire impossible", error);
    showContactFallback();
  } finally {
    clearTimeout(timer);
    contactSubmit.disabled = false;
    contactSubmit.querySelector("span").textContent = "Envoyer ma demande";
  }
});

// Petite fenêtre affichée seulement si l'envoi a échoué pour une raison technique.
function showContactFallback() {
  let dialog = document.getElementById("contact-fallback");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "contact-fallback";
    dialog.className = "contact-fallback";
    dialog.setAttribute("aria-labelledby", "contact-fallback-title");
    dialog.innerHTML = `
      <p class="contact-fallback-title" id="contact-fallback-title">Un problème avec l’envoi du formulaire ?</p>
      <p>Votre message n’a pas pu partir pour une raison technique. Vous pouvez nous contacter directement :</p>
      <p class="contact-fallback-links">
        <a href="mailto:info@alexandrepalanca.fr">info@alexandrepalanca.fr</a>
        <a href="tel:+33679538280">+33 6 79 53 82 80</a>
      </p>
      <button type="button" class="contact-fallback-close">Fermer</button>`;
    dialog.querySelector(".contact-fallback-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}
