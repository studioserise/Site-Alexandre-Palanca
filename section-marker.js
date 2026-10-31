/*
  Repère latéral photographique (ordinateur uniquement).

  Sections prises en compte : les <header> et <section> de <main> qui ne sont
  contenus dans aucun autre <header>/<section>. Pour exclure une section :
  data-marker-skip. Pour forcer la teinte : data-marker-tone="light" (repère
  sombre, fond clair) ou "dark" (repère ivoire, fond sombre).

  La règle couvre la hauteur de la fenêtre. Chaque grand tiret correspond à une
  section ; la position de lecture glisse en continu de l'un à l'autre, les
  tirets proches grandissent, et le numéro apparaît à l'arrivée sur un grand tiret.
*/
(() => {
  const main = document.querySelector("main");
  if (!main || document.querySelector(".section-marker")) return;

  const sections = [...main.querySelectorAll("header, section")].filter(
    (el) => !el.hasAttribute("data-marker-skip") && !el.parentElement.closest("header, section")
  );
  if (sections.length < 2) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const PITCH = 14; // espacement visé entre deux graduations (px)
  const INSET = 22; // marge haute et basse de la règle (px)
  const SIGMA_PX = 46; // étendue de l'effet d'agrandissement (px)
  const RAMP = 0.14; // fondu du numéro, en fraction de la hauteur de fenêtre

  const marker = document.createElement("div");
  marker.className = "section-marker";
  marker.setAttribute("aria-hidden", "true");
  document.body.append(marker);

  let groupOf = [];
  let groupCount = 0;
  let subdivisions = 0;
  let ticks = [];
  let labels = [];
  let anchors = [];
  let shown = [];
  let pitch = PITCH;
  let target = 0;
  let current = 0;
  let frame = 0;

  // Des sections côte à côte (même position verticale) ne forment qu'une étape.
  const smooth = (x) => x * x * (3 - 2 * x);

  const computeGroups = () => {
    groupOf = [];
    let previous = null;
    let group = -1;
    sections.forEach((el) => {
      const r = el.getBoundingClientRect();
      const sameRow = previous && Math.abs(r.top - previous.top) < 4 && Math.abs(r.bottom - previous.bottom) < 4;
      if (!sameRow) group += 1;
      groupOf.push(group);
      previous = r;
    });
    return group + 1;
  };

  const buildScale = () => {
    const intervals = Math.max(groupCount - 1, 1);
    const height = Math.max(window.innerHeight - INSET * 2, 200);
    subdivisions = Math.max(2, Math.round(height / PITCH / intervals));
    const steps = intervals * subdivisions;
    pitch = height / steps;
    marker.replaceChildren();
    ticks = [];
    labels = [];
    for (let i = 0; i <= steps; i += 1) {
      const tick = document.createElement("span");
      const major = i % subdivisions === 0;
      tick.className = "section-marker-tick" + (major ? " is-major" : "");
      tick.style.top = `${INSET + i * pitch}px`;
      tick.dataset.major = major ? i / subdivisions : "";
      marker.append(tick);
      ticks.push(tick);
      if (major) {
        const label = document.createElement("span");
        label.className = "section-marker-number";
        label.style.top = `${INSET + i * pitch}px`;
        label.textContent = String(i / subdivisions + 1).padStart(2, "0");
        marker.append(label);
        labels[i / subdivisions] = label;
      }
    }
  };

  // Défilement correspondant à l'arrivée sur chaque section (interpolation linéaire entre deux).
  const computeAnchors = () => {
    const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    anchors = [];
    for (let g = 0; g < groupCount; g += 1) {
      const el = sections[groupOf.indexOf(g)];
      let position = g === 0 ? 0 : el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3;
      position = Math.min(Math.max(position, 0), max);
      if (g > 0) position = Math.max(position, anchors[g - 1] + 1);
      anchors.push(position);
    }
  };

  // Le numéro apparaît quand le haut de la section atteint le haut de la fenêtre
  // et disparaît quand son bas atteint le milieu de la fenêtre.
  const readVisibility = () => {
    const h = window.innerHeight;
    const ramp = h * RAMP;
    const room = Math.max(document.documentElement.scrollHeight - h - window.scrollY, 0);
    const top = [];
    const bottom = [];
    sections.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const g = groupOf[i];
      top[g] = top[g] === undefined ? r.top : Math.min(top[g], r.top);
      bottom[g] = bottom[g] === undefined ? r.bottom : Math.max(bottom[g], r.bottom);
    });
    shown = top.map((t, g) => {
      // La dernière section ne peut pas toujours remonter jusqu'en haut de la fenêtre.
      const reach = Math.max(t - room, 0);
      const appear = Math.min(Math.max(1 - (t - reach) / ramp, 0), 1);
      // Les sections courtes gardent leur numéro un instant : seuil ramené à 40 % de leur hauteur.
      const height = bottom[g] - top[g];
      const mid = Math.min(h / 2, height * 0.4);
      const vanish = Math.min(Math.max((bottom[g] - mid) / Math.min(ramp, height * 0.3), 0), 1);
      return smooth(Math.min(appear, vanish));
    });
  };

  const readPosition = () => {
    const y = window.scrollY;
    if (y <= anchors[0]) return 0;
    for (let g = 1; g < groupCount; g += 1) {
      if (y <= anchors[g]) return g - 1 + (y - anchors[g - 1]) / (anchors[g] - anchors[g - 1]);
    }
    return groupCount - 1;
  };

  const render = () => {
    const c = current * subdivisions;
    const sigma = SIGMA_PX / pitch;
    ticks.forEach((tick, j) => {
      const d = j - c;
      const g = Math.exp(-(d * d) / (2 * sigma * sigma));
      let width;
      let alpha;
      if (tick.dataset.major) {
        const index = Number(tick.dataset.major);
        const a = shown[index] || 0;
        width = 0.3 + 0.1 * g + 0.6 * a;
        alpha = 0.6 + 0.4 * Math.max(g, a);
        labels[index].style.opacity = a;
        labels[index].style.translate = `${(1 - a) * -6}px 0`;
      } else {
        width = 0.15 + 0.3 * g;
        alpha = 0.34 + 0.5 * g;
      }
      tick.style.transform = `scaleX(${width.toFixed(3)})`;
      tick.style.opacity = alpha.toFixed(3);
    });
  };

  const loop = () => {
    frame = 0;
    const delta = target - current;
    if (reduceMotion.matches || Math.abs(delta) < 0.0004) current = target;
    else current += delta * 0.16;
    render();
    if (current !== target) frame = requestAnimationFrame(loop);
  };

  const update = () => {
    target = readPosition();
    readVisibility();
    if (!frame) frame = requestAnimationFrame(loop);
  };

  const refresh = () => {
    const total = computeGroups();
    if (total !== groupCount || !ticks.length) {
      groupCount = total;
      buildScale();
    }
    computeAnchors();
    target = readPosition();
    readVisibility();
    current = target;
    render();
  };

  const luminance = (rgb) => {
    const [r, g, b] = rgb.match(/[\d.]+/g).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };

  const toneOf = (section) => {
    for (let el = section; el && el !== document.documentElement; el = el.parentElement) {
      if (el.dataset.markerTone) return el.dataset.markerTone;
      const bg = getComputedStyle(el).backgroundColor;
      const alpha = bg.startsWith("rgba") ? Number(bg.match(/[\d.]+/g)[3]) : 1;
      if (alpha > 0.6) return luminance(bg) > 0.55 ? "light" : "dark";
    }
    return "dark";
  };

  // La teinte suit la section qui croise la ligne médiane de l'écran.
  const toneObserver = new IntersectionObserver(
    (entries) => {
      const hit = entries.filter((e) => e.isIntersecting).pop();
      if (hit) marker.dataset.tone = toneOf(hit.target);
    },
    { rootMargin: "-50% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach((el) => toneObserver.observe(el));

  // Masquage pendant l'ouverture du menu et sur le pied de page.
  let menuOpen = false;
  let footerVisible = false;
  const refreshVisibility = () => marker.classList.toggle("is-hidden", menuOpen || footerVisible);

  const nav = document.getElementById("site-nav");
  if (nav) {
    new MutationObserver(() => {
      menuOpen = nav.classList.contains("is-menu-open");
      refreshVisibility();
    }).observe(nav, { attributes: true, attributeFilter: ["class"] });
  }

  const footerObserver = new IntersectionObserver(
    ([entry]) => {
      footerVisible = entry.isIntersecting;
      refreshVisibility();
    },
    { rootMargin: "0px 0px -35% 0px" }
  );
  const watchFooter = () => {
    const footer = document.querySelector(".site-footer");
    if (!footer) return false;
    footerObserver.observe(footer);
    return true;
  };
  if (!watchFooter()) {
    const wait = new MutationObserver(() => watchFooter() && wait.disconnect());
    wait.observe(document.body, { childList: true });
  }

  let resizeTimer;
  const scheduleRefresh = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 150);
  };
  window.addEventListener("resize", scheduleRefresh);
  new ResizeObserver(scheduleRefresh).observe(main);
  window.addEventListener("scroll", update, { passive: true });

  const start = () => {
    refresh();
    requestAnimationFrame(() => marker.classList.add("is-ready"));
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
