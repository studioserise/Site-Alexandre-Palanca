/* Aperçu dans l'espace client (suivi de site) — à inclure dans le site en cours de création :
   <script src="https://alexandrepalanca.fr/apercu.js" defer></script>
   Quand le site est affiché dans le suivi, le script indique la page affichée (pour que la vue
   ordinateur et la vue téléphone restent sur la même page) et son défilement (pour qu'elles défilent
   ensemble). Le client circule librement entre toutes les pages. Hors du cadre, le script ne fait rien. */
(function () {
  if (window.parent === window) return;
  var PARENT = "https://alexandrepalanca.fr";
  window.parent.postMessage({ type: "apercu-location", url: window.location.href }, PARENT);

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
