import { getConfig } from "./galeries-config.js";

const contactForm = document.getElementById("contact-form");
const contactStatus = document.getElementById("contact-form-status");
const contactSubmit = document.getElementById("contact-submit");
const config = getConfig();

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  contactStatus.textContent = "";
  delete contactStatus.dataset.kind;

  if (!contactForm.reportValidity()) return;

  const formData = new FormData(contactForm);
  const payload = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    service: formData.get("service"),
    date: formData.get("date"),
    message: formData.get("message"),
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
