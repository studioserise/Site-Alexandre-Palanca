import { getConfig } from "./galeries-config.js";
import {
  callGalleryFunction,
  downloadGalleryPhoto,
  isBackendConfigured
} from "./galeries-api.js";

const title = document.getElementById("order-status-title");
const message = document.getElementById("order-status-message");
const downloads = document.getElementById("order-downloads");
const sessionId = new URLSearchParams(window.location.search).get("session_id");

if (!isBackendConfigured() || !sessionId || !getConfig()) {
  title.textContent = "Paiement à vérifier";
  message.textContent =
    "Cette page de retour ne confirme pas à elle seule un paiement. Consultez votre e-mail ou contactez Alexandre pour vérifier la commande.";
} else {
  try {
    let result;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      result = await callGalleryFunction(
        `order-status?session_id=${encodeURIComponent(sessionId)}`,
        { method: "GET" }
      );
      if (result.status !== "pending_payment" || attempt === 5) break;
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }

    if (["paid_to_prepare", "sent"].includes(result.status)) {
      title.textContent = "Merci pour votre commande";
      message.textContent =
        "Le paiement est confirmé. Téléchargez ci-dessous vos photographies haute résolution.";
      downloads.replaceChildren(
        ...result.photos.map((photo) => {
          const button = document.createElement("button");
          button.className = "gallery-primary-button";
          button.type = "button";
          button.textContent = `Télécharger la photo ${String(photo.photoNumber).padStart(3, "0")}`;
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await downloadGalleryPhoto(photo.photoId, sessionId);
            } catch (error) {
              message.textContent = error.message;
              button.textContent = "Réessayer le téléchargement";
              button.title = error.message;
            } finally {
              button.disabled = false;
            }
          });
          return button;
        })
      );
      downloads.hidden = result.photos.length === 0;
      if (!result.photos.length) {
        message.textContent =
          "Le paiement est confirmé, mais aucune photo téléchargeable n’est associée à cette commande. Contactez Alexandre.";
      }
    } else if (result.status === "cancelled_refunded") {
      title.textContent = "Commande annulée ou remboursée";
      message.textContent =
        "Aucun téléchargement n’est disponible pour cette commande. Contactez Alexandre si vous pensez qu’il s’agit d’une erreur.";
    } else {
      title.textContent = "Paiement en cours de vérification";
      message.textContent =
        "Le paiement n’est pas encore confirmé par la notification sécurisée du serveur. Cette page ne valide pas le paiement à elle seule ; vous pouvez patienter ou contacter Alexandre.";
    }
  } catch (error) {
    title.textContent = "Paiement à vérifier";
    message.textContent = `${error.message} Le retour sur cette page ne vaut pas validation du paiement ; contactez Alexandre si le montant a été débité.`;
  }
}
