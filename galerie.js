import { getConfig } from "./galeries-config.js";
import { callGalleryFunction, isBackendConfigured } from "./galeries-api.js";

const config = getConfig();
const form = document.getElementById("gallery-entry-form");
const input = document.getElementById("gallery-access-code");
const message = document.getElementById("gallery-entry-message");
const submitButton = document.getElementById("gallery-entry-submit");
const demoNote = document.getElementById("gallery-demo-note");

demoNote.hidden = !config.demoMode;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  message.dataset.kind = "";

  const code = input.value.trim().toUpperCase();
  if (!code) {
    message.textContent = "Saisissez le code transmis par votre photographe.";
    return;
  }

  if (config.demoMode && code === config.demoAccessCode) {
    window.location.assign("galerie-privee.html?demo=1");
    return;
  }

  if (config.demoMode && code === config.demoClosedAccessCode) {
    message.textContent = "Cette galerie de démonstration est fermée. Les galeries privées ne sont pas encore connectées au serveur.";
    return;
  }

  if (!isBackendConfigured()) {
    message.textContent = "Code invalide, ou galerie privée non configurée. Essayez le code de démonstration indiqué ci-dessous.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Vérification…";

  try {
    const result = await callGalleryFunction("gallery-access", { body: { code } });
    if (!result.accessToken) {
      throw new Error("Le serveur n’a pas confirmé l’accès à cette galerie.");
    }
    window.sessionStorage.setItem("gallery-session-token", result.accessToken);
    window.location.assign("galerie-privee.html");
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Accéder à la galerie";
  }
});
