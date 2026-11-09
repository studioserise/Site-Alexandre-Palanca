/* Aperçu dans l'espace client (suivi de site) — à inclure dans le site en cours de création :
   <script src="https://alexandrepalanca.fr/apercu.js" defer></script>
   Quand le site est affiché dans le cadre du suivi, un clic sur un lien ne change pas de page
   directement : le suivi décide (bascule sur la page prévue, ou message « page en cours de création »).
   Hors du cadre, le script ne fait rien. */
(function () {
  if (window.parent === window) return;
  var PARENT = "https://alexandrepalanca.fr";
  window.addEventListener("click", function (event) {
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link) return;
    var href = link.getAttribute("href") || "";
    if (href.charAt(0) === "#" || /^(mailto|tel):/i.test(href) || link.target === "_blank") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent.postMessage({ type: "apercu-navigation", url: link.href }, PARENT);
  }, true);
})();
