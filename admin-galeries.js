import { getConfig } from "./galeries-config.js";
import { callGalleryFunction, uploadSignedObject } from "./galeries-api.js";

const config = getConfig();
const loginForm = document.getElementById("admin-login-form");
const dashboard = document.getElementById("admin-dashboard");
const message = document.getElementById("admin-message");
const galleryList = document.getElementById("admin-gallery-list");
const orderList = document.getElementById("admin-order-list");
const photoGallerySelect = document.getElementById("admin-photo-gallery");
const tariffSelect = document.getElementById("admin-gallery-tariff");
const accessTokenKey = "gallery-admin-access-token";

let accessToken = window.sessionStorage.getItem(accessTokenKey);

function setMessage(text, isError = true) {
  message.textContent = text;
  message.style.color = isError ? "#e6aaa2" : "#c6d6c1";
}

function makeText(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  return element;
}

function tariffLabel(tariff) {
  return {
    tarif0: "Gratuit",
    tarif2: "2 € / photo",
    tarif5: "5 € / photo"
  }[tariff] || "Tarif inconnu";
}

function updatePhotoUploadNote() {
  const tariff = photoGallerySelect.selectedOptions[0]?.dataset.tariff;
  const previewLabel = document.getElementById("admin-photo-preview-label");
  const uploadNote = document.getElementById("admin-photo-upload-note");
  if (!tariff) {
    previewLabel.textContent = "Aperçu (JPG, PNG ou WebP, max. 50 Mo)";
    uploadNote.textContent = "Créez ou ouvrez une galerie avant d’ajouter des photos.";
    return;
  }
  const isFree = tariff === "tarif0";
  previewLabel.textContent =
    `${isFree ? "Aperçu sans filigrane" : "Aperçu déjà filigrané"} (JPG, PNG ou WebP, max. 50 Mo)`;
  uploadNote.textContent = isFree
    ? "Cette galerie est gratuite : choisissez un aperçu sans filigrane. Les deux fichiers restent privés ; seul le téléchargement autorisé transmettra l’original."
    : "Cette galerie est payante : le filigrane doit être intégré à l’aperçu avant l’envoi. Les deux fichiers restent privés ; seul l’original acheté sera téléchargeable.";
}

async function callAdmin(body) {
  return callGalleryFunction("admin-api", {
    method: body ? "POST" : "GET",
    body,
    accessToken
  });
}

async function signIn(email, password) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Le service sécurisé n’est pas encore configuré.");
  }
  const response = await fetch(
    `${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error(result.msg || result.message || "Connexion refusée.");
  }
  return result.access_token;
}

function renderGalleries(galleries) {
  galleryList.replaceChildren();
  const openGalleries = galleries.filter((gallery) =>
    gallery.status === "open" && Date.parse(gallery.expires_at) > Date.now()
  );
  photoGallerySelect.replaceChildren();
  for (const gallery of openGalleries) {
    const option = document.createElement("option");
    option.value = gallery.id;
    option.textContent = `${gallery.name} — ${tariffLabel(gallery.tariff)}`;
    option.dataset.tariff = gallery.tariff;
    photoGallerySelect.append(option);
  }
  photoGallerySelect.disabled = openGalleries.length === 0;
  updatePhotoUploadNote();
  if (!galleries.length) {
    galleryList.append(makeText("p", "gallery-admin-note", "Aucune galerie."));
    return;
  }
  for (const gallery of galleries) {
    const record = document.createElement("article");
    record.className = "gallery-admin-record";
    const header = document.createElement("div");
    header.className = "gallery-admin-record-header";
    header.append(
      makeText("strong", "", gallery.name),
      makeText(
        "span",
        `gallery-page-status${gallery.status === "closed" || Date.parse(gallery.expires_at) <= Date.now() ? " is-closed" : ""}`,
        gallery.status === "closed"
          ? "Fermée"
          : Date.parse(gallery.expires_at) <= Date.now()
            ? "Expirée"
            : "Ouverte"
      )
    );
    record.append(header);
    record.append(makeText("small", "", `${gallery.type === "event" ? "Événement partagé" : "Individuelle"} · ${tariffLabel(gallery.tariff)} · ferme le ${new Date(gallery.expires_at).toLocaleDateString("fr-FR")}`));
    if (gallery.status === "open") {
      const button = makeText("button", "gallery-quiet-button", "Fermer cette galerie");
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await callAdmin({ action: "close-gallery", galleryId: gallery.id });
          await loadDashboard();
        } catch (error) {
          setMessage(error.message);
          button.disabled = false;
        }
      });
      record.append(button);
    }
    galleryList.append(record);
  }
}

function renderOrders(orders, orderPhotos, galleries) {
  orderList.replaceChildren();
  if (!orders.length) {
    orderList.append(makeText("p", "gallery-admin-note", "Aucune commande."));
    return;
  }
  const photosByOrder = new Map();
  const galleriesById = new Map(galleries.map((gallery) => [gallery.id, gallery.name]));
  for (const photo of orderPhotos) {
    const items = photosByOrder.get(photo.order_id) ?? [];
    items.push(String(photo.photo_number).padStart(3, "0"));
    photosByOrder.set(photo.order_id, items);
  }

  for (const order of orders) {
    const record = document.createElement("article");
    record.className = "gallery-admin-record";
    const statusLabels = {
      pending_payment: "En attente de paiement",
      paid_to_prepare: "Payée, à préparer",
      sent: "Envoyée",
      cancelled_refunded: "Annulée / remboursée"
    };
    const header = document.createElement("div");
    header.className = "gallery-admin-record-header";
    header.append(
      makeText("strong", "", statusLabels[order.status] || order.status),
      makeText("span", "", new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: order.currency.toUpperCase()
      }).format(order.total_cents / 100))
    );
    record.append(header);
    record.append(makeText("small", "", `${galleriesById.get(order.gallery_id) || "Galerie"} · ${order.customer_email} · photos ${(photosByOrder.get(order.id) || []).join(", ")} · ${new Date(order.created_at).toLocaleString("fr-FR")}`));

    if (order.status === "paid_to_prepare") {
      const button = makeText("button", "gallery-quiet-button", "Marquer comme envoyée");
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await callAdmin({ action: "update-order", orderId: order.id, status: "sent" });
          await loadDashboard();
        } catch (error) {
          setMessage(error.message);
          button.disabled = false;
        }
      });
      record.append(button);
      const cancelButton = makeText("button", "gallery-quiet-button", "Enregistrer comme annulée / remboursée");
      cancelButton.type = "button";
      cancelButton.addEventListener("click", async () => {
        if (!window.confirm("Effectuez d’abord tout remboursement nécessaire dans Stripe. Voulez-vous enregistrer ce statut ?")) return;
        cancelButton.disabled = true;
        try {
          await callAdmin({
            action: "update-order",
            orderId: order.id,
            status: "cancelled_refunded"
          });
          await loadDashboard();
        } catch (error) {
          setMessage(error.message);
          cancelButton.disabled = false;
        }
      });
      record.append(cancelButton);
    } else if (order.status === "pending_payment") {
      record.append(makeText("small", "gallery-admin-note", "Le statut payé est uniquement confirmé par le webhook Stripe."));
    }
    orderList.append(record);
  }
}

async function loadDashboard() {
  const data = await callAdmin();
  const galleries = data.galleries || [];
  renderGalleries(galleries);
  renderOrders(data.orders || [], data.orderPhotos || [], galleries);
  loginForm.hidden = true;
  dashboard.hidden = false;
  setMessage("", false);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    accessToken = await signIn(
      document.getElementById("admin-email").value.trim(),
      document.getElementById("admin-password").value
    );
    window.sessionStorage.setItem(accessTokenKey, accessToken);
    await loadDashboard();
  } catch (error) {
    setMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("admin-logout").addEventListener("click", () => {
  window.sessionStorage.removeItem(accessTokenKey);
  accessToken = null;
  dashboard.hidden = true;
  loginForm.hidden = false;
  setMessage("Vous êtes déconnecté.", false);
});

document.getElementById("admin-create-gallery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  const code = document.getElementById("admin-gallery-code").value.trim().toUpperCase();
  try {
    const result = await callAdmin({
      action: "create-gallery",
      name: document.getElementById("admin-gallery-name").value.trim(),
      type: document.getElementById("admin-gallery-type").value,
      tariff: tariffSelect.value,
      daysOpen: Number(document.getElementById("admin-gallery-days").value),
      code
    });
    document.getElementById("admin-created-code").textContent =
      `Galerie créée. Communiquez maintenant le code ${result.accessCode} au client ; il n’est pas conservé en clair.`;
    event.currentTarget.reset();
    document.getElementById("admin-gallery-days").value = "15";
    await loadDashboard();
    document.getElementById("admin-created-code").textContent =
      `Galerie créée. Communiquez maintenant le code ${result.accessCode} au client ; il n’est pas conservé en clair.`;
  } catch (error) {
    setMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

photoGallerySelect.addEventListener("change", updatePhotoUploadNote);

document.getElementById("admin-add-photos-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const previewFile = document.getElementById("admin-photo-preview").files[0];
  const originalFile = document.getElementById("admin-photo-original").files[0];
  const galleryId = photoGallerySelect.value;
  const photoNumber = Number(document.getElementById("admin-photo-number").value);
  if (!galleryId || !previewFile || !originalFile) {
    setMessage("Choisissez une galerie ouverte ainsi que les deux fichiers photo.");
    return;
  }
  if (previewFile.size > 50 * 1024 * 1024 || originalFile.size > 50 * 1024 * 1024) {
    setMessage("Chaque fichier doit faire au maximum 50 Mo.");
    return;
  }

  button.disabled = true;
  button.textContent = "Préparation du téléversement…";
  try {
    const upload = await callAdmin({
      action: "prepare-photo-upload",
      galleryId,
      photoNumber,
      previewFileName: previewFile.name,
      originalFileName: originalFile.name
    });
    button.textContent = "Téléversement des fichiers…";
    await Promise.all([
      uploadSignedObject(upload.preview.bucket, upload.preview.path, upload.preview.token, previewFile),
      uploadSignedObject(upload.original.bucket, upload.original.path, upload.original.token, originalFile)
    ]);
    await callAdmin({
      action: "register-photo",
      galleryId,
      photoId: upload.photoId,
      photoNumber: upload.photoNumber,
      previewPath: upload.preview.path,
      originalPath: upload.original.path
    });
    form.reset();
    setMessage(`Photo ${String(photoNumber).padStart(3, "0")} ajoutée à la galerie.`, false);
    await loadDashboard();
  } catch (error) {
    setMessage(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Téléverser les deux fichiers";
  }
});

if (accessToken) {
  loadDashboard().catch((error) => {
    window.sessionStorage.removeItem(accessTokenKey);
    accessToken = null;
    setMessage(error.message);
  });
}
