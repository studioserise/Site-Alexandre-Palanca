import { getConfig } from "./galeries-config.js";
import {
  callGalleryFunction,
  downloadGalleryPhoto,
  fetchGalleryPreview,
  isBackendConfigured
} from "./galeries-api.js?v=tarifs-downloads";

const config = getConfig();
const params = new URLSearchParams(window.location.search);
const isDemo = config.demoMode && params.get("demo") === "1";
const elements = {
  title: document.getElementById("gallery-title"),
  description: document.getElementById("gallery-description"),
  demoBanner: document.getElementById("gallery-demo-banner"),
  serviceWarning: document.getElementById("gallery-service-warning"),
  loadError: document.getElementById("gallery-load-error"),
  grid: document.getElementById("gallery-grid"),
  orderBar: document.getElementById("gallery-order-bar"),
  orderDetails: document.getElementById("gallery-order-details"),
  orderItems: document.getElementById("gallery-order-items"),
  count: document.getElementById("gallery-selection-count"),
  discountSummary: document.getElementById("gallery-selection-discount"),
  subtotal: document.getElementById("gallery-subtotal"),
  discountLabel: document.getElementById("gallery-discount-label"),
  discount: document.getElementById("gallery-discount"),
  totalDetail: document.getElementById("gallery-total-detail"),
  totalCompact: document.getElementById("gallery-total-compact"),
  openDetails: document.getElementById("gallery-open-details"),
  closeDetails: document.getElementById("gallery-close-details"),
  checkoutForm: document.getElementById("gallery-checkout-form"),
  checkoutButton: document.getElementById("gallery-checkout-button"),
  checkoutMessage: document.getElementById("gallery-checkout-message"),
  viewer: document.getElementById("gallery-viewer"),
  viewerImage: document.getElementById("gallery-viewer-image"),
  viewerNumber: document.getElementById("gallery-viewer-number"),
  viewerCounter: document.getElementById("gallery-viewer-counter"),
  viewerSelect: document.getElementById("gallery-viewer-select"),
  viewerDownload: document.getElementById("gallery-viewer-download"),
  viewerClose: document.getElementById("gallery-viewer-close"),
  viewerPrev: document.getElementById("gallery-viewer-prev"),
  viewerNext: document.getElementById("gallery-viewer-next"),
  viewerSwipeArea: document.getElementById("gallery-viewer-swipe-area")
};

const state = {
  galleryId: null,
  tariff: "tarif5",
  photos: [],
  selected: new Set(),
  pricing: config.demoPricing,
  viewerIndex: -1,
  lastFocusedElement: null,
  pointerStartX: null,
  previewUrls: new Map(),
  previewPromises: new Map()
};

async function ensurePreview(photo) {
  if (photo.demo) return photo.previewUrl;
  if (state.previewUrls.has(photo.id)) return state.previewUrls.get(photo.id);
  if (state.previewPromises.has(photo.id)) return state.previewPromises.get(photo.id);
  const promise = fetchGalleryPreview(photo.id).then((url) => {
    state.previewUrls.set(photo.id, url);
    return url;
  }).finally(() => state.previewPromises.delete(photo.id));
  state.previewPromises.set(photo.id, promise);
  return promise;
}

function requestPreview(photoId, imageElement) {
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  ensurePreview(photo).then((url) => {
    imageElement.src = url;
  }).catch((error) => {
    imageElement.alt = `Aperçu indisponible : ${error.message}`;
  });
}

const formatMoney = (cents) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR"
}).format(cents / 100);

function calculateTotals() {
  const count = state.selected.size;
  const unitPriceCents = state.pricing.unitPriceCents;
  const subtotalCents = count * unitPriceCents;
  const tier = [...state.pricing.tiers]
    .sort((a, b) => a.minPhotos - b.minPhotos)
    .filter((item) => count >= item.minPhotos)
    .at(-1);
  const discountBps = count === 0 ? 0 : (tier?.discountBps ?? 0);
  const discountCents = Math.floor((subtotalCents * discountBps) / 10000);

  return {
    count,
    subtotalCents,
    discountBps,
    discountCents,
    totalCents: subtotalCents - discountCents
  };
}

function makeCheckIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 20 20");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m4 10 4 4 8-8");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  icon.append(path);
  return icon;
}

function togglePhoto(photoId) {
  if (state.tariff === "tarif0") return;
  if (state.selected.has(photoId)) {
    state.selected.delete(photoId);
  } else {
    state.selected.add(photoId);
  }
  renderSelection();
}

function createPhotoCard(photo, index) {
  const card = document.createElement("article");
  card.className = "gallery-photo";
  card.dataset.photoId = photo.id;

  const openButton = document.createElement("button");
  openButton.className = "gallery-photo-open";
  openButton.type = "button";
  openButton.setAttribute("aria-label", `Ouvrir la photo ${photo.photoNumber}`);

  const image = document.createElement("img");
  const isFree = !photo.demo && state.tariff === "tarif0";
  image.alt = `${isFree ? "Aperçu" : "Aperçu filigrané"} de la photo ${photo.photoNumber}`;
  image.loading = "lazy";
  image.dataset.photoId = photo.id;
  openButton.append(image);

  if (!isFree) {
    const watermark = document.createElement("span");
    watermark.className = "gallery-preview-watermark";
    watermark.textContent = photo.demo ? "APERÇU DÉMO" : "APERÇU";
    openButton.append(watermark);
  }
  openButton.addEventListener("click", () => openViewer(index));

  const number = document.createElement("span");
  number.className = "gallery-photo-number";
  number.textContent = photo.photoNumber;

  if (!isFree) {
    const selectButton = document.createElement("button");
    selectButton.className = "gallery-select-button";
    selectButton.type = "button";
    selectButton.setAttribute("aria-label", `Sélectionner la photo ${photo.photoNumber}`);
    selectButton.setAttribute("aria-pressed", "false");
    selectButton.append(makeCheckIcon());
    selectButton.addEventListener("click", () => togglePhoto(photo.id));
    card.append(selectButton);
  } else {
    const downloadButton = document.createElement("button");
    downloadButton.className = "gallery-photo-download";
    downloadButton.type = "button";
    downloadButton.textContent = "Télécharger HD";
    downloadButton.addEventListener("click", async () => {
      downloadButton.disabled = true;
      try {
        await downloadGalleryPhoto(photo.id);
      } catch (error) {
        elements.loadError.hidden = false;
        elements.loadError.textContent = error.message;
        downloadButton.textContent = "Réessayer";
        downloadButton.title = error.message;
      } finally {
        downloadButton.disabled = false;
      }
    });
    card.append(downloadButton);
  }

  card.append(openButton, number);
  return card;
}

function renderPhotos() {
  elements.grid.replaceChildren(
    ...state.photos.map((photo, index) => createPhotoCard(photo, index))
  );
  const images = elements.grid.querySelectorAll("img[data-photo-id]");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        requestPreview(entry.target.dataset.photoId, entry.target);
      }
    }, { rootMargin: "160px" });
    images.forEach((image) => observer.observe(image));
  } else {
    images.forEach((image) => requestPreview(image.dataset.photoId, image));
  }
}

function renderSelection() {
  const totals = calculateTotals();
  const selectedPhotos = state.photos.filter((photo) => state.selected.has(photo.id));

  for (const card of elements.grid.querySelectorAll(".gallery-photo")) {
    const photoId = card.dataset.photoId;
    const selected = state.selected.has(photoId);
    const button = card.querySelector(".gallery-select-button");
    const number = card.querySelector(".gallery-photo-number").textContent;
    if (!button) continue;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute(
      "aria-label",
      `${selected ? "Désélectionner" : "Sélectionner"} la photo ${number}`
    );
  }

  elements.count.textContent =
    `${totals.count} photo${totals.count === 1 ? "" : "s"} sélectionnée${totals.count === 1 ? "" : "s"}`;
  elements.discountSummary.textContent = totals.discountBps
    ? `Remise de ${totals.discountBps / 100} % — économie de ${formatMoney(totals.discountCents)}`
    : "Aucune remise";
  elements.subtotal.textContent = formatMoney(totals.subtotalCents);
  elements.discountLabel.textContent = totals.discountBps
    ? `Remise (${totals.discountBps / 100} %)`
    : "Remise";
  elements.discount.textContent = `− ${formatMoney(totals.discountCents)}`;
  elements.totalDetail.textContent = formatMoney(totals.totalCents);
  elements.totalCompact.textContent = formatMoney(totals.totalCents);
  elements.openDetails.disabled = totals.count === 0;
  elements.checkoutButton.disabled = totals.count === 0;

  elements.orderItems.replaceChildren(
    ...selectedPhotos.map((photo) => {
      const item = document.createElement("li");
      const number = document.createElement("span");
      const price = document.createElement("span");
      number.textContent = `Photo ${photo.photoNumber}`;
      price.textContent = formatMoney(state.pricing.unitPriceCents);
      item.append(number, price);
      return item;
    })
  );

  renderViewerSelection();
}

function renderViewerSelection() {
  if (state.viewerIndex < 0) return;
  const photo = state.photos[state.viewerIndex];
  if (!photo) return;
  const selected = state.selected.has(photo.id);
  elements.viewerSelect.setAttribute("aria-pressed", String(selected));
  elements.viewerSelect.textContent = selected
    ? "Désélectionner cette photo"
    : "Sélectionner cette photo";
}

function renderViewer() {
  const photo = state.photos[state.viewerIndex];
  if (!photo) return;
  const isFree = !photo.demo && state.tariff === "tarif0";
  elements.viewerImage.removeAttribute("src");
  elements.viewerImage.alt = `${isFree ? "Aperçu" : "Aperçu filigrané"} de la photo ${photo.photoNumber}`;
  ensurePreview(photo).then((url) => {
    if (state.photos[state.viewerIndex]?.id === photo.id && !elements.viewer.hidden) {
      elements.viewerImage.src = url;
    }
  }).catch((error) => {
    elements.viewerImage.alt = `Aperçu indisponible : ${error.message}`;
  });
  elements.viewerNumber.textContent = `Photo ${photo.photoNumber}`;
  elements.viewer.querySelector(".gallery-viewer-watermark").hidden = isFree;
  elements.viewerSelect.hidden = isFree;
  elements.viewerDownload.hidden = !isFree;
  elements.viewerDownload.textContent = "Télécharger en haute résolution";
  elements.viewerDownload.removeAttribute("title");
  elements.viewerDownload.onclick = async () => {
    elements.viewerDownload.disabled = true;
    try {
      await downloadGalleryPhoto(photo.id);
    } catch (error) {
      elements.loadError.hidden = false;
      elements.loadError.textContent = error.message;
      elements.viewerDownload.textContent = "Réessayer le téléchargement";
      elements.viewerDownload.title = error.message;
    } finally {
      elements.viewerDownload.disabled = false;
    }
  };
  elements.viewerCounter.textContent =
    `${state.viewerIndex + 1} / ${state.photos.length}`;
  renderViewerSelection();
}

function openViewer(index) {
  state.viewerIndex = index;
  state.lastFocusedElement = document.activeElement;
  renderViewer();
  elements.viewer.hidden = false;
  document.body.style.overflow = "hidden";
  elements.viewerClose.focus();
}

function closeViewer() {
  elements.viewer.hidden = true;
  document.body.style.removeProperty("overflow");
  state.viewerIndex = -1;
  state.lastFocusedElement?.focus();
}

function moveViewer(direction) {
  if (!state.photos.length) return;
  state.viewerIndex =
    (state.viewerIndex + direction + state.photos.length) % state.photos.length;
  renderViewer();
}

function setDetailsExpanded(expanded) {
  elements.orderDetails.hidden = !expanded;
  elements.openDetails.setAttribute("aria-expanded", String(expanded));
  elements.openDetails.textContent = expanded ? "Masquer le détail" : "Détail de l’achat";
}

async function submitCheckout(event) {
  event.preventDefault();
  elements.checkoutMessage.textContent = "";

  if (state.tariff === "tarif0") {
    elements.checkoutMessage.textContent = "Cette galerie est gratuite : téléchargez chaque photo directement depuis son aperçu.";
    return;
  }

  if (isDemo) {
    elements.checkoutMessage.textContent =
      "Démonstration uniquement : aucun paiement n’est actif. Une intégration Stripe sécurisée doit être configurée côté serveur.";
    return;
  }

  if (!isBackendConfigured()) {
    elements.checkoutMessage.textContent =
      "Le paiement sécurisé n’est pas encore configuré. Aucune commande n’a été créée.";
    return;
  }

  const email = document.getElementById("gallery-customer-email").value.trim();
  elements.checkoutButton.disabled = true;
  elements.checkoutButton.textContent = "Préparation du paiement…";

  try {
    const checkout = await callGalleryFunction("create-checkout", {
      body: {
        galleryId: state.galleryId,
        photoIds: [...state.selected],
        email
      }
    });

    if (!checkout.checkoutUrl) {
      throw new Error("Le prestataire de paiement n’a pas fourni de lien de paiement.");
    }

    window.location.assign(checkout.checkoutUrl);
  } catch (error) {
    elements.checkoutMessage.textContent = error.message;
    elements.checkoutButton.disabled = false;
    elements.checkoutButton.textContent = "Poursuivre vers le paiement";
  }
}

function createDemoPhotos() {
  const sources = ["images/lieux-marques.jpg", "images/accueil.jpg"];
  return Array.from({ length: 16 }, (_, index) => ({
    id: `demo-photo-${index + 1}`,
    photoNumber: String(index + 1).padStart(3, "0"),
    previewUrl: sources[index % sources.length],
    demo: true
  }));
}

function showLoadError(message, { serviceUnavailable = false } = {}) {
  elements.loadError.hidden = !message;
  elements.loadError.textContent = message;
  elements.serviceWarning.hidden = !serviceUnavailable;
  elements.grid.replaceChildren();
  elements.orderBar.hidden = true;
}

async function loadGallery() {
  if (isDemo) {
    elements.title.textContent = "Galerie de démonstration";
    elements.description.textContent =
      "Exemple d’une galerie d’événement partagée. Les 16 références, la sélection et les prix sont fictifs.";
    elements.demoBanner.hidden = false;
    elements.orderBar.hidden = false;
    state.photos = createDemoPhotos();
    renderPhotos();
    renderSelection();
    return;
  }

  if (!isBackendConfigured()) {
    showLoadError("", { serviceUnavailable: true });
    return;
  }

  try {
    const data = await callGalleryFunction("gallery-data", { method: "GET" });
    state.galleryId = data.gallery.id;
    state.tariff = data.gallery.tariff;
    state.pricing = data.pricing;
    state.photos = data.photos.map((photo) => ({
      ...photo,
      photoNumber: String(photo.photoNumber).padStart(3, "0"),
      demo: false
    }));
    elements.title.textContent = data.gallery.name;
    const galleryTypeDescription = data.gallery.type === "individual"
      ? "Galerie personnelle"
      : "Galerie de l’événement";
    if (state.tariff === "tarif0") {
      elements.description.textContent =
        `${galleryTypeDescription} gratuite : les aperçus sont sans filigrane. Téléchargez les originaux haute résolution directement.`;
      elements.orderBar.hidden = true;
    } else {
      const price = formatMoney(data.pricing.unitPriceCents);
      const discountDescription = state.tariff === "tarif5"
        ? " Des réductions s’appliquent aux commandes de plusieurs photos."
        : "";
      elements.description.textContent =
        `${galleryTypeDescription} : aperçus filigranés, ${price} par photo.${discountDescription} Après paiement confirmé, téléchargez vos originaux depuis la page de confirmation.`;
      elements.orderBar.hidden = false;
    }
    renderPhotos();
    if (state.tariff !== "tarif0") renderSelection();
  } catch (error) {
    showLoadError(error.message);
  }
}

elements.openDetails.addEventListener("click", () => setDetailsExpanded(true));
elements.closeDetails.addEventListener("click", () => setDetailsExpanded(false));
elements.checkoutForm.addEventListener("submit", submitCheckout);
elements.viewerClose.addEventListener("click", closeViewer);
elements.viewerPrev.addEventListener("click", () => moveViewer(-1));
elements.viewerNext.addEventListener("click", () => moveViewer(1));
elements.viewerSelect.addEventListener("click", () => {
  const photo = state.photos[state.viewerIndex];
  if (photo) togglePhoto(photo.id);
});
elements.viewer.addEventListener("click", (event) => {
  if (event.target === elements.viewer) closeViewer();
});
elements.viewerSwipeArea.addEventListener("pointerdown", (event) => {
  state.pointerStartX = event.clientX;
});
elements.viewerSwipeArea.addEventListener("pointerup", (event) => {
  if (state.pointerStartX === null) return;
  const delta = event.clientX - state.pointerStartX;
  state.pointerStartX = null;
  if (Math.abs(delta) > 55) moveViewer(delta > 0 ? -1 : 1);
});
elements.viewerSwipeArea.addEventListener("pointercancel", () => {
  state.pointerStartX = null;
});

document.addEventListener("keydown", (event) => {
  if (elements.viewer.hidden) return;
  if (event.key === "Escape") closeViewer();
  if (event.key === "ArrowLeft") moveViewer(-1);
  if (event.key === "ArrowRight") moveViewer(1);
  if (event.key === "Tab") {
    const focusable = [...elements.viewer.querySelectorAll("button:not(:disabled)")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

window.addEventListener("pagehide", () => {
  for (const url of state.previewUrls.values()) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
});

loadGallery();
