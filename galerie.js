import { getConfig } from "./galeries-config.js?v=2";
import { callGalleryFunction, isBackendConfigured } from "./galeries-api.js";

const config = getConfig();
const form = document.getElementById("gallery-entry-form");
const input = document.getElementById("gallery-access-code");
const message = document.getElementById("gallery-entry-message");
const submitButton = document.getElementById("gallery-entry-submit");
const demoNote = document.getElementById("gallery-demo-note");

demoNote.hidden = !config.demoMode;

// Livraison vidéo : fenêtre avec un bouton « Télécharger » par vidéo (liens externes), sans ouvrir de galerie.
const dialog = document.getElementById("video-dialog");
async function showVideoDialog(accessToken) {
  const data = await callGalleryFunction("gallery-data", { method: "GET", accessToken });
  const videos = data.videos ?? [];
  document.getElementById("video-dialog-title").textContent = data.gallery.name;
  document.getElementById("video-dialog-intro").textContent = videos.length > 1 || videos.some((video) => video.multiple)
    ? "Vos vidéos sont prêtes. Chaque lien s’ouvre dans un nouvel onglet."
    : "Votre vidéo est prête. Le lien s’ouvre dans un nouvel onglet.";
  if (videos.length === 1 && videos[0].multiple) {
    document.getElementById("video-dialog-intro").textContent = "Vos vidéos sont prêtes. Le lien s’ouvre dans un nouvel onglet.";
  }
  const list = document.getElementById("video-dialog-list");
  list.replaceChildren(...videos.map((video) => {
    const card = document.createElement("div");
    card.className = "gallery-video-card";
    const name = document.createElement("strong");
    name.textContent = video.label;
    const link = document.createElement("a");
    link.className = "gallery-primary-button";
    link.href = video.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = video.multiple ? "Télécharger les vidéos" : "Télécharger la vidéo";
    link.addEventListener("click", () => {
      callGalleryFunction("gallery-data?compter=video", { method: "GET", accessToken }).catch(() => {});
    });
    card.append(name, link);
    return card;
  }));
  input.value = "";
  dialog.showModal();
}
dialog.addEventListener("click", (event) => {
  if (event.target === dialog || event.target.closest("[data-close]")) dialog.close();
});

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
    message.textContent = "Les galeries privées sont momentanément indisponibles. Contactez-nous pour accéder à vos photos.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Vérification…";

  try {
    const result = await callGalleryFunction("gallery-access", { body: { code } });
    if (!result.accessToken) {
      throw new Error("Le serveur n’a pas confirmé l’accès à cette galerie.");
    }
    if (result.delivery === "video") {
      await showVideoDialog(result.accessToken);
      return;
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
