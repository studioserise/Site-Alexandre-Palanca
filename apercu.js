/* Aperçu dans l'espace client (suivi de site) — à inclure dans le site en cours de création :
   <script src="https://alexandrepalanca.fr/apercu.js" defer></script>
   Quand le site est affiché dans le cadre du suivi, un clic sur un lien ne change pas de page
   directement : le suivi décide (bascule sur la page prévue, ou message « page en cours de création »).
   Il signale aussi son défilement, pour que la vue ordinateur et la vue téléphone défilent ensemble.
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

  // Défilement synchronisé (proportion de la page, de 0 à 1)
  var following = 0;
  function ratio() {
    var doc = document.scrollingElement || document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    return max > 0 ? window.scrollY / max : 0;
  }
  var pending = false;
  window.addEventListener("scroll", function () {
    if (Date.now() < following || pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      window.parent.postMessage({ type: "apercu-scroll", ratio: ratio() }, PARENT);
    });
  }, { passive: true });
  window.addEventListener("message", function (event) {
    if (event.origin !== PARENT || !event.data || event.data.type !== "apercu-scroll-to") return;
    var doc = document.scrollingElement || document.documentElement;
    following = Date.now() + 200;
    window.scrollTo(0, Number(event.data.ratio || 0) * Math.max(0, doc.scrollHeight - window.innerHeight));
  });
})();
