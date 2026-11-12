import { callGalleryFunction } from "./galeries-api.js";

// Contenus réseaux (espace client) : dossiers triés à télécharger (liens) et guide PDF affiché.
const $ = (id) => document.getElementById(id);

function showError(text) {
  $("social-title").textContent = "Contenus indisponibles";
  $("social-error").textContent = text;
  $("social-error").hidden = false;
}

const SPACES = {
  social: {
    service: "reseaux", eyebrow: "Contenus réseaux", folders: "Vos dossiers", pdf: "Guide d’utilisation", pdfShort: "le guide", file: "Guide",
    intro: "Téléchargez vos dossiers, puis suivez le guide pour publier vos contenus sur les réseaux sociaux.",
    empty: "Le guide sera bientôt disponible."
  },
  identite: {
    service: "identite", eyebrow: "Identité visuelle", folders: "Vos fichiers", pdf: "Charte graphique", pdfShort: "la charte graphique", file: "Charte graphique",
    intro: "Téléchargez les fichiers de votre identité visuelle (logos, éléments graphiques, fichiers d’impression) et consultez votre charte graphique.",
    empty: "La charte graphique sera bientôt disponible."
  }
};

async function start() {
  let data;
  try {
    data = await callGalleryFunction("gallery-data", { method: "GET" });
  } catch (error) {
    return showError(`${error.message} Saisissez à nouveau votre code dans l’espace client.`);
  }
  const kind = SPACES[data.gallery?.delivery];
  if (!kind) return showError("Ce code ne correspond pas à cet espace.");
  // Même page pour les contenus réseaux et l'identité visuelle : seuls les textes changent
  $("space-eyebrow").textContent = kind.eyebrow;
  $("space-intro").textContent = kind.intro;
  $("space-folders-title").textContent = kind.folders;
  $("space-pdf-title").textContent = kind.pdf;
  $("space-back").href = `galerie.html?service=${kind.service}`;
  $("social-guide-frame").title = `${kind.pdf} (PDF)`;
  $("social-guide-download").textContent = `Télécharger ${kind.pdfShort} (PDF)`;
  $("social-guide-empty").textContent = kind.empty;
  document.title = `${data.gallery.name} — ${kind.eyebrow}`;
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
    download.href = `${data.tutorialUrl}${data.tutorialUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(`${kind.file} — ${data.gallery.name}.pdf`)}`;
    download.hidden = false;
  } else {
    $("social-guide-empty").hidden = false;
  }
  $("social-layout").hidden = false;
}

start();
