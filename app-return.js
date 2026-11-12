// Pages complètes de l'administration ouvertes depuis l'application installée sur l'iPhone :
// en plein écran il n'y a pas de bouton « Retour » du navigateur, on affiche donc un bouton
// « Application » pour y revenir. Sans effet dans un navigateur classique.
(function () {
  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (!standalone) return;
  var link = document.createElement("a");
  link.href = "/app/";
  link.textContent = "‹ Application";
  link.setAttribute("aria-label", "Revenir à l'application");
  link.style.cssText = "position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:9999;" +
    "padding:12px 16px;border-radius:999px;background:#f5f3ef;color:#080808;font:600 14px Arial,Helvetica,sans-serif;" +
    "text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.45)";
  var add = function () { document.body.appendChild(link); };
  if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
})();
