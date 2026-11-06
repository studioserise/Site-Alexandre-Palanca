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

  if (!contactForm.reportValidity()) return;

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

  try {
    const response = await fetch(
      `${config.supabaseUrl}/functions/v1/contact-request`,
      {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(result?.message || "L’envoi n’a pas abouti. Réessayez dans quelques instants.");
    }

    contactForm.reset();
    contactStatus.dataset.kind = "success";
    contactStatus.textContent = "Votre demande a bien été envoyée. Merci, je reviendrai vers vous dès que possible.";
  } catch (error) {
    contactStatus.textContent = error instanceof Error
      ? error.message
      : "Une erreur est survenue pendant l’envoi. Réessayez dans quelques instants.";
  } finally {
    contactSubmit.disabled = false;
    contactSubmit.querySelector("span").textContent = "Envoyer ma demande";
  }
});
