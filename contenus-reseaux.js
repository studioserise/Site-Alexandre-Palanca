import { callGalleryFunction } from "./galeries-api.js";

// Contenus réseaux (espace client) : dossiers triés à télécharger (liens) et guide PDF affiché.
const $ = (id) => document.getElementById(id);

function showError(text) {
  $("social-title").textContent = "Contenus indisponibles";
  $("social-error").textContent = text;
  $("social-error").hidden = false;
}

async function start() {
  let data;
  try {
    data = await callGalleryFunction("gallery-data", { method: "GET" });
  } catch (error) {
    return showError(`${error.message} Saisissez à nouveau votre code dans l’espace client.`);
  }
  if (data.gallery?.delivery !== "social") return showError("Ce code ne correspond pas à des contenus réseaux.");
  document.title = `${data.gallery.name} — Contenus réseaux`;
  $("social-title").textContent = data.gallery.name;

  $("social-folders").replaceChildren(...data.folders.map((folder) => {
    const card = document.createElement("div");
    card.className = "social-folder";
    const icon = document.createElement("span");
    icon.className = "social-folder-icon";
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = folder.label;
    text.append(name);
    if (folder.description) {
      const description = document.createElement("p");
      description.textContent = folder.description;
      text.append(description);
    }
    const link = document.createElement("a");
    link.className = "gallery-quiet-button";
    link.href = folder.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Télécharger";
    link.addEventListener("click", () => {
      callGalleryFunction("gallery-data?compter=video", { method: "GET" }).catch(() => {});
    });
    card.append(icon, text, link);
    return card;
  }));

  if (data.tutorialUrl) {
    const frame = $("social-guide-frame");
    frame.src = data.tutorialUrl;
    frame.hidden = false;
    const download = $("social-guide-download");
    download.href = `${data.tutorialUrl}${data.tutorialUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(`Guide — ${data.gallery.name}.pdf`)}`;
    download.hidden = false;
  } else {
    $("social-guide-empty").hidden = false;
  }
  $("social-layout").hidden = false;
}

start();
