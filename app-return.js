// Pages complètes de l'administration ouvertes depuis l'application installée (iPhone) :
// l'application ne contient que l'administration, jamais le site public.
// - menu et pied de page du site masqués, logo -> retour à l'application ;
// - bouton « ‹ Application » (pas de bouton Retour en plein écran) ;
// - tout lien vers une page publique du site s'ouvre dans Safari, hors de l'application.
// Sans effet dans un navigateur classique.
(function () {
  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (!standalone) return;

  var ADMIN = /^\/(app\/.*|admin(\.html)?|gestion-commerciale(\.html)?|admin-galeries(\.html)?)$/;
  document.documentElement.classList.add("in-app");

  var style = document.createElement("style");
  style.textContent =
    ".in-app .site-nav-links,.in-app .site-nav-toggle,.in-app .site-nav nav,.in-app .site-footer,.in-app .site-footer-ground{display:none!important}" +
    ".in-app body{padding-bottom:calc(env(safe-area-inset-bottom,0px) + 80px)}" +
    ".in-app .site-nav{padding-top:env(safe-area-inset-top,0px)}";
  document.head.appendChild(style);

  // Liens : administration dans l'application, site public dans Safari
  window.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    var url;
    try { url = new URL(link.getAttribute("href"), window.location.href); } catch (e) { return; }
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.hash) return; // ancres internes à la page
    if (ADMIN.test(url.pathname)) return;
    event.preventDefault();
    event.stopImmediatePropagation(); // avant l'animation de transition des pages du site
    window.open(url.href, "_blank", "noopener");
  }, true);

  var ready = function () {
    var brand = document.querySelector(".site-nav-brand");
    if (brand) { brand.setAttribute("href", "/app/"); brand.setAttribute("aria-label", "Revenir à l'application"); }
    var back = document.createElement("a");
    back.href = "/app/";
    back.textContent = "‹ Application";
    back.setAttribute("aria-label", "Revenir à l'application");
    back.style.cssText = "position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:9999;" +
      "padding:12px 16px;border-radius:999px;background:#f5f3ef;color:#080808;font:600 14px Arial,Helvetica,sans-serif;" +
      "text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.45)";
    document.body.appendChild(back);
  };
  if (document.body) ready(); else document.addEventListener("DOMContentLoaded", ready);
})();
