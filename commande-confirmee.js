import { getConfig } from "./galeries-config.js";
import { callGalleryFunction, isBackendConfigured } from "./galeries-api.js";

const title = document.getElementById("order-status-title");
const message = document.getElementById("order-status-message");
const sessionId = new URLSearchParams(window.location.search).get("session_id");

if (!isBackendConfigured() || !sessionId || !getConfig()) {
  title.textContent = "Paiement à vérifier";
  message.textContent =
    "Cette page de retour ne confirme pas à elle seule un paiement. Consultez votre e-mail ou contactez Alexandre pour vérifier la commande.";
} else {
  try {
    const result = await callGalleryFunction(
      `order-status?session_id=${encodeURIComponent(sessionId)}`,
      { method: "GET" }
    );
    if (result.status === "paid_to_prepare") {
      title.textContent = "Merci pour votre commande";
      message.textContent =
        "Le paiement a été confirmé par le serveur. Les photographies haute résolution seront préparées et envoyées manuellement par Alex via WeTransfer.";
    } else {
      title.textContent = "Paiement en cours de vérification";
      message.textContent =
        "Le paiement n’est pas encore confirmé par la notification sécurisée du serveur. Cette page ne valide pas le paiement à elle seule ; vous pouvez patienter ou contacter Alexandre.";
    }
  } catch {
    title.textContent = "Paiement à vérifier";
    message.textContent =
      "La confirmation sécurisée est momentanément indisponible. Le retour sur cette page ne vaut pas validation du paiement ; contactez Alexandre si le montant a été débité.";
  }
}
