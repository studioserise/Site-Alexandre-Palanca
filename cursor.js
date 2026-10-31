const cursorRoot = document.documentElement;
const PRESSED = "is-cursor-pressed";

// Préchargement : évite le retour au curseur par défaut au premier changement d'état
["images/viseur.png?v=6", "images/viseur-clic.png?v=6"].forEach((src) => {
  new Image().src = src;
});

function releaseCustomCursor() {
  cursorRoot.classList.remove(PRESSED);
}

document.addEventListener("mousedown", (event) => {
  if (event.button === 0) cursorRoot.classList.add(PRESSED);
}, true);

// Capture sur window : le relâchement est détecté même hors de la page ou pendant un glisser
["mouseup", "dragend", "drop", "contextmenu", "pointerup", "pointercancel", "blur"].forEach((type) => {
  window.addEventListener(type, releaseCustomCursor, true);
});

// Filet de sécurité : sans bouton enfoncé, l'état « cliqué » est levé
document.addEventListener("mousemove", (event) => {
  if (event.buttons === 0 && cursorRoot.classList.contains(PRESSED)) {
    releaseCustomCursor();
  }
}, true);

document.addEventListener("mouseleave", releaseCustomCursor);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseCustomCursor();
});
window.addEventListener("pageshow", releaseCustomCursor);
