/* Page « Identité visuelle » :
   - portfolio : un projet à la fois (galerie à gauche, présentation à droite), projets lus dans le bloc JSON « iv-projects » ;
   - boutons « Discuter de ce projet » : ouvrent le formulaire avec la formule déjà choisie.
   Les apparitions au défilement viennent de reseaux.js, le formulaire de contact.js. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- portfolio
  var root = document.querySelector("[data-iv-portfolio]");
  var data = document.getElementById("iv-projects");
  var projects = [];
  try { projects = JSON.parse(data ? data.textContent : "[]"); } catch (error) { projects = []; }

  if (root && projects.length) {
    var track = root.querySelector("[data-iv-track]");
    var thumbs = root.querySelector("[data-iv-thumbs]");
    var desc = root.querySelector("[data-iv-desc]");
    var index = 0;

    var el = function (tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    var syncThumbs = function () {
      var width = track.clientWidth || 1;
      var current = Math.round(track.scrollLeft / width);
      Array.prototype.forEach.call(thumbs.children, function (button, i) {
        button.setAttribute("aria-current", String(i === current));
      });
    };

    var render = function () {
      var project = projects[index];
      var images = project.images || [];

      track.replaceChildren.apply(track, images.map(function (image, i) {
        var figure = el("figure", image.fond === "clair" ? "is-light" : "");
        var img = el("img");
        img.src = image.src;
        img.alt = image.alt || "";
        img.decoding = "async";
        if (i > 0) img.loading = "lazy";
        figure.append(img);
        return figure;
      }));
      track.scrollLeft = 0;
      track.setAttribute("aria-label", "Visuels du projet " + project.titre);

      thumbs.replaceChildren.apply(thumbs, images.length > 1 ? images.map(function (image, i) {
        var button = el("button", image.fond === "clair" ? "is-light" : "");
        button.type = "button";
        button.setAttribute("aria-label", "Visuel " + (i + 1) + " sur " + images.length);
        button.setAttribute("aria-current", String(i === 0));
        var img = el("img");
        img.src = image.src;
        img.alt = "";
        img.loading = "lazy";
        button.append(img);
        button.addEventListener("click", function () {
          track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
        });
        return button;
      }) : []);

      var parts = [el("span", "studio-eyebrow portfolio-kind", project.type || ""), el("h3", "", project.titre || "")];
      if (project.conceptuel) parts.push(el("span", "iv-chip", "Projet conceptuel"));
      if (project.contexte) parts.push(el("p", "", project.contexte));
      if (project.prestations && project.prestations.length) {
        parts.push(el("h4", "", "Réalisations"));
        var list = el("ul", "rs-list");
        project.prestations.forEach(function (item) { list.append(el("li", "", item)); });
        parts.push(list);
      }
      if (projects.length > 1) parts.push(el("p", "iv-count", (index + 1) + " / " + projects.length));
      desc.replaceChildren.apply(desc, parts);
    };

    var show = function (next) {
      index = (next + projects.length) % projects.length;
      desc.classList.add("is-changing");
      window.setTimeout(function () { render(); desc.classList.remove("is-changing"); }, 220);
    };

    root.classList.toggle("is-single", projects.length < 2);
    root.querySelector("[data-iv-prev]").addEventListener("click", function () { show(index - 1); });
    root.querySelector("[data-iv-next]").addEventListener("click", function () { show(index + 1); });
    track.addEventListener("scroll", function () { window.requestAnimationFrame(syncThumbs); }, { passive: true });
    render();
  } else if (root) {
    root.closest("section").hidden = true; // aucun projet : la section reste masquée
  }

  // ---------------------------------------------------------------- formules -> formulaire
  document.querySelectorAll("[data-formule]").forEach(function (link) {
    link.addEventListener("click", function () {
      var select = document.getElementById("pref-formule");
      if (select) select.value = link.getAttribute("data-formule");
      var reveal = document.querySelector("[data-contact-reveal]");
      if (reveal && reveal.getAttribute("aria-expanded") !== "true") reveal.click();
    });
  });
})();
