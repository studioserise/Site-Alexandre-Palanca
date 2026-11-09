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

  // Mini-portfolio : un mockup à la fois (flèches, points, défilement automatique, glisser au doigt)
  document.querySelectorAll("[data-rs-mockups]").forEach(function (carousel) {
    var slides = Array.prototype.slice.call(carousel.querySelectorAll(".rs-mock-slide"));
    var desc = carousel.querySelector("[data-rs-desc]");
    var dotsBox = carousel.querySelector(".rs-mock-dots");
    if (slides.length < 2 || !desc) return;
    var index = 0;
    var timer = null;
    var hovering = false;
    var visible = false;
    var dots = slides.map(function (slide, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", "Exemple " + (i + 1) + " : " + slide.dataset.title);
      dot.addEventListener("click", function () { show(i); restart(); });
      if (dotsBox) dotsBox.appendChild(dot);
      return dot;
    });
    function syncVideos() {
      slides.forEach(function (slide, i) {
        slide.querySelectorAll("video").forEach(function (video) {
          if (i === index && visible && !reduced) {
            if (video.preload === "none") video.preload = "auto";
            var playing = video.play();
            if (playing && playing.catch) playing.catch(function () {});
          } else {
            video.pause();
          }
        });
      });
    }
    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        slide.classList.toggle("is-active", i === index);
        slide.setAttribute("aria-hidden", String(i !== index));
      });
      dots.forEach(function (dot, i) { dot.setAttribute("aria-current", String(i === index)); });
      var slide = slides[index];
      desc.classList.add("is-changing");
      window.setTimeout(function () {
        desc.querySelector(".portfolio-kind").textContent = slide.dataset.kind || "";
        desc.querySelector("h3").textContent = slide.dataset.title || "";
        desc.querySelector("p").textContent = slide.dataset.text || "";
        desc.classList.remove("is-changing");
      }, reduced ? 0 : 260);
      syncVideos();
    }
    function restart() {
      window.clearInterval(timer);
      if (reduced) return;
      timer = window.setInterval(function () {
        if (!hovering && visible && !document.hidden) show(index + 1);
      }, 5500);
    }
    carousel.querySelector("[data-rs-prev]").addEventListener("click", function () { show(index - 1); restart(); });
    carousel.querySelector("[data-rs-next]").addEventListener("click", function () { show(index + 1); restart(); });
    carousel.addEventListener("mouseenter", function () { hovering = true; });
    carousel.addEventListener("mouseleave", function () { hovering = false; });
    var startX = null;
    carousel.addEventListener("touchstart", function (event) { startX = event.touches[0].clientX; }, { passive: true });
    carousel.addEventListener("touchend", function (event) {
      if (startX === null) return;
      var delta = event.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(delta) > 45) { show(index + (delta < 0 ? 1 : -1)); restart(); }
    }, { passive: true });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        syncVideos();
      }, { threshold: 0.3 }).observe(carousel);
    } else {
      visible = true;
    }
    show(0);
    restart();
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
