/* Page « Contenus réseaux sociaux » : apparitions au défilement, légère profondeur (parallaxe),
   vidéos lues seulement à l'écran, carrousel qui défile tout seul. Discret et sans dépendance. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("rs-js");

  // Apparition progressive des blocs
  var revealables = document.querySelectorAll("[data-rs-reveal]");
  if (reduced || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        // Petits décalages pour les éléments voisins (effet de cascade)
        var siblings = Array.prototype.indexOf.call(el.parentElement.children, el);
        el.style.transitionDelay = Math.min(siblings, 4) * 90 + "ms";
        el.classList.add("is-in");
        revealer.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    revealables.forEach(function (el) { revealer.observe(el); });
  }

  // Vidéos : lecture quand elles sont visibles, pause sinon (économise batterie et données)
  var videos = document.querySelectorAll("[data-rs-video]");
  if ("IntersectionObserver" in window) {
    var player = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target;
        if (entry.isIntersecting && !reduced) {
          if (video.preload === "none") video.preload = "auto";
          var playing = video.play();
          if (playing && playing.catch) playing.catch(function () {});
        } else {
          video.pause();
        }
      });
    }, { threshold: 0.35 });
    videos.forEach(function (video) { player.observe(video); });
  }

  // Carrousel : une diapositive toutes les 3 secondes
  document.querySelectorAll("[data-rs-carousel]").forEach(function (post) {
    var track = post.querySelector(".rs-post-slides");
    var dots = post.querySelectorAll(".rs-post-dots i");
    var count = track ? track.children.length : 0;
    if (!track || count < 2 || reduced) return;
    var index = 0;
    setInterval(function () {
      if (document.hidden) return;
      index = (index + 1) % count;
      track.style.transform = "translateX(" + (-100 * index) + "%)";
      dots.forEach(function (dot, i) { dot.classList.toggle("is-on", i === index); });
    }, 3000);
  });

  // Profondeur : déplacement subtil des éléments selon le défilement (grands écrans uniquement)
  var layers = document.querySelectorAll("[data-rs-depth]");
  var wide = window.matchMedia("(min-width: 641px)");
  if (reduced || !layers.length) return;
  var ticking = false;
  function update() {
    ticking = false;
    var viewport = window.innerHeight;
    layers.forEach(function (layer) {
      if (!wide.matches) { layer.style.translate = ""; return; }
      var box = layer.getBoundingClientRect();
      if (box.bottom < -200 || box.top > viewport + 200) return;
      var offset = (box.top + box.height / 2 - viewport / 2) * Number(layer.dataset.rsDepth || 0);
      // « translate » se combine avec les rotations déjà définies en CSS
      layer.style.translate = "0 " + (-offset).toFixed(1) + "px";
    });
  }
  function request() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  update();
})();
