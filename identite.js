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
    var compo = root.querySelector("[data-iv-compo]");
    var desc = root.querySelector("[data-iv-desc]");
    var index = 0;

    var el = function (tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    // Visuels du projet : 1 à 3 images composées dans le cadre (la première en grand)
    var render = function () {
      var project = projects[index];
      var images = (project.images || []).slice(0, 3);
      // Visuels détourés (t-shirt, objet…) : posés par-dessus les autres, sans fond
      var framed = images.filter(function (image) { return !image.detoure; }).length;
      var cutout = images.some(function (image) { return image.detoure; });
      compo.className = "iv-compo iv-compo--" + framed + (cutout ? " has-cutout" : "");
      compo.replaceChildren.apply(compo, images.map(function (image, i) {
        var figure = el("figure", "iv-compo-item" + (image.detoure ? " is-cutout" : image.fond === "clair" ? " is-light" : ""));
        var img = el("img");
        img.src = image.src;
        img.alt = image.alt || "";
        img.decoding = "async";
        if (index > 0 || i > 0) img.loading = "lazy";
        figure.append(img);
        return figure;
      }));

      var parts = [el("span", "studio-eyebrow portfolio-kind", project.type || ""), el("h3", "", project.titre || "")];
      if (project.conceptuel === true) parts.push(el("span", "iv-chip", "Projet conceptuel"));
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
      compo.classList.add("is-changing");
      window.setTimeout(function () { render(); desc.classList.remove("is-changing"); }, 260);
    };

    root.classList.toggle("is-single", projects.length < 2);
    root.querySelector("[data-iv-prev]").addEventListener("click", function () { show(index - 1); });
    root.querySelector("[data-iv-next]").addEventListener("click", function () { show(index + 1); });
    // Glisser du doigt pour changer de projet
    var startX = null;
    root.addEventListener("touchstart", function (event) { startX = event.touches[0].clientX; }, { passive: true });
    root.addEventListener("touchend", function (event) {
      if (startX === null || projects.length < 2) return;
      var dx = event.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      startX = null;
    }, { passive: true });
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
