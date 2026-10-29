import { getConfig } from "./galeries-config.js";
import {
  callGalleryFunction,
  downloadGalleryPhotosZip,
  isBackendConfigured
} from "./galeries-api.js?v=paid-order-email";

const title = document.getElementById("order-status-title");
const message = document.getElementById("order-status-message");
const downloads = document.getElementById("order-downloads");
const downloadButton = document.getElementById("order-download-zip");
const downloadMessage = document.getElementById("order-download-message");
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
        "Le paiement est confirmé. Téléchargez ci-dessous les photographies haute résolution de votre commande.";
      downloads.hidden = result.photos.length === 0;
      if (result.photos.length) {
        downloadButton.addEventListener("click", async () => {
          downloadButton.disabled = true;
          downloadMessage.textContent = "";
          downloadMessage.removeAttribute("data-kind");
          downloadButton.textContent = "Préparation du ZIP…";
          try {
            await downloadGalleryPhotosZip(
              result.photos.map((photo) => photo.photoId),
              "commande",
              (current, total) => {
                downloadButton.textContent = current === "zip"
                  ? "Création du ZIP…"
                  : `Téléchargement ${current}/${total}…`;
              },
              sessionId
            );
            downloadMessage.dataset.kind = "success";
            downloadMessage.textContent = "Votre archive ZIP a été téléchargée.";
          } catch (error) {
            downloadMessage.textContent = error.message;
          } finally {
            downloadButton.disabled = false;
            downloadButton.textContent = "Télécharger mes photos en ZIP";
          }
        });
      }
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
