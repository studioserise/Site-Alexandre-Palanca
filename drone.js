/*
  Section « Prendre de la hauteur » : composant partagé (accueil + Lieux & marques).

  - Le contenu est défini une seule fois (DRONE_CONTENT) ; chaque page n'a qu'à déclarer
    <section data-drone-section data-drone-flight="home|local" data-drone-cta="…"> dans <main>.
  - Le trajet est piloté par le scroll (GSAP + ScrollTrigger, fichiers locaux dans /vendor).
  - Le stationnaire est une couche indépendante : il n'influence jamais la progression du trajet.
  - Chaque instance possède son propre calque, ses références et ses ScrollTriggers.
*/

const DRONE_CONTENT = {
  eyebrow: "Prises de vues aériennes",
  title: "Prendre de la hauteur.",
  text: "Une autre perspective pour raconter les lieux, révéler les espaces et donner une nouvelle dimension à vos projets. Grâce aux prises de vues aériennes, chaque réalisation prend de la hauteur.",
  cta: "Découvrir les formules",
  // Fond par défaut : photo ou vidéo (.mp4/.webm), remplaçable par page avec data-drone-media.
  backdrop: "images/Lieux-et-marques/hero-lieux-et-marques-poster.jpg",
  compactText: "Une vue aérienne peut enrichir cette prestation : plans d'ensemble, perspective sur le lieu, nouvelle dimension pour vos images.",
  backdropAlt: "",
  sprite: "images/dji-lito-x1.png"
};

const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileQuery = window.matchMedia("(max-width: 800px)");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createBackdrop(src, poster) {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(src)) {
    const video = el("video", "drone-backdrop");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    if (poster) video.poster = poster;
    video.src = src;
    return video;
  }
  const img = el("img", "drone-backdrop");
  img.src = src;
  img.alt = DRONE_CONTENT.backdropAlt;
  img.loading = "lazy";
  img.decoding = "async";
  return img;
}

// Fond en noir et blanc, à l'arrêt ; couleur (et lecture si vidéo) au survol de la section.
function setupHover(section, backdrop) {
  const isVideo = backdrop instanceof HTMLVideoElement;
  const enter = () => {
    section.classList.add("is-hover");
    if (isVideo) backdrop.play().catch(() => {});
  };
  const leave = () => {
    section.classList.remove("is-hover");
    if (isVideo) backdrop.pause();
  };
  section.addEventListener("pointerenter", enter);
  section.addEventListener("pointerleave", leave);
}

function renderSection(section) {
  const content = DRONE_CONTENT;
  const compact = section.dataset.droneVariant === "compact";
  section.classList.add("drone-section");
  if (compact) section.classList.add("drone-section--compact");
  section.id = section.id || "drone";
  const titleId = `${section.id}-title`;
  section.setAttribute("aria-labelledby", titleId);

  const media = el("div", "drone-media");
  media.setAttribute("aria-hidden", "true");
  const backdrop = createBackdrop(section.dataset.droneMedia || content.backdrop, section.dataset.dronePoster);
  media.append(backdrop, el("div", "drone-shade"));
  setupHover(section, backdrop);

  const copy = el("div", "drone-copy");
  const title = el("h2", "", content.title);
  title.id = titleId;
  const cta = el("a", "drone-cta");
  cta.href = section.dataset.droneCta || "#";
  const arrow = el("span", "", "↗︎");
  arrow.setAttribute("aria-hidden", "true");
  cta.append((section.dataset.droneCtaLabel || content.cta) + " ", arrow);

  if (compact) {
    copy.append(el("p", "drone-eyebrow", content.eyebrow), title, el("p", "drone-text", section.dataset.droneText || content.compactText), cta);
  } else {
    copy.append(el("p", "drone-eyebrow", content.eyebrow), title, el("p", "drone-text", content.text));
    if (section.dataset.droneCta) copy.append(cta);
  }

  const stage = el("div", "drone-stage");
  const target = el("div", "drone-target");
  target.setAttribute("aria-hidden", "true");
  stage.append(target);

  // Variante compacte : drone à gauche, texte à droite.
  if (compact) section.append(media, stage, copy);
  else section.append(media, copy, stage);
  return { target };
}

function createSprite(sprite) {
  const img = el("img", "drone-sprite");
  img.src = sprite;
  img.alt = "";
  img.width = 1280;
  img.height = 1280;
  img.decoding = "async";
  img.draggable = false;
  img.setAttribute("aria-hidden", "true");
  return img;
}

// Version statique : drone posé dans son cadre, sans animation.
function mountStatic(section, target) {
  section.classList.add("is-static");
  const sprite = createSprite(DRONE_CONTENT.sprite);
  if (section.dataset.droneFlip === "left") sprite.style.transform = "scaleX(-1)";
  target.append(sprite);
}

function mountFlight(section, target, flightMode, flip) {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  const layer = el("div", "drone-layer");
  layer.setAttribute("aria-hidden", "true");
  const sprite = createSprite(DRONE_CONTENT.sprite);
  layer.append(sprite);
  document.body.append(layer);

  // Géométrie (recalculée à chaque refresh de ScrollTrigger).
  const geo = {
    vw: 0, vh: 0, size: 0, mobile: false,
    cx: 0, cy: 0, startScroll: 0, endScroll: 1, sectionBottom: 0,
    x0: 0, y0: 0, s0: 0.5, amp: 0
  };

  function measure() {
    const scrollY = window.scrollY;
    const rect = target.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    geo.vw = window.innerWidth;
    geo.vh = window.innerHeight;
    geo.mobile = mobileQuery.matches;
    geo.size = rect.width;
    geo.cx = rect.left + rect.width / 2;
    geo.cy = rect.top + scrollY + rect.height / 2;
    geo.sectionBottom = sectionRect.bottom + scrollY;
    geo.endScroll = Math.max(1, geo.cy - geo.vh * 0.52);

    if (flightMode === "home") {
      // Départ à l'entrée de la section des prestations, côté droit de l'écran.
      const anchor = document.getElementById("univers");
      const anchorTop = anchor ? anchor.getBoundingClientRect().top + scrollY : geo.endScroll - geo.vh * 1.6;
      geo.startScroll = clamp(anchorTop - geo.vh * 0.35, 0, geo.endScroll - geo.vh * 0.6);
    } else {
      // Trajet court : le drone apparaît à proximité de sa section.
      geo.startScroll = Math.max(0, geo.endScroll - geo.vh * (geo.mobile ? 0.7 : 0.95));
    }

    // Entrée par le bord droit de la page, à mi-hauteur, loin au fond puis qui s'approche.
    geo.s0 = geo.mobile ? 0.3 : 0.26;
    geo.x0 = flip ? -geo.size * geo.s0 * 0.6 : geo.vw + geo.size * geo.s0 * 0.6;
    geo.y0 = geo.vh * 0.6;
    geo.amp = geo.vh * 0.04;
    sprite.style.width = `${geo.size}px`;
    sprite.style.height = `${geo.size}px`;
  }

  // État physique.
  const body = { x: 0, y: 0, vx: 0, vy: 0, ready: false };
  const sway = { ox: 0, oy: 0, ovx: 0, ovy: 0 }; // rebond après l'arrêt du scroll
  const tilt = { a: 0, v: 0 };
  const track = { bx: 0, by: 0, vbx: 0, vby: 0, lastScroll: -1, lastMove: 0, wasMoving: false };
  let active = false;
  let lastTime = 0;
  let nextMicro = 0;
  let visibleOpacity = 0;

  const ease = gsap.parseEase("power2.inOut");

  function frame(time) {
    if (!active) return;
    const dt = clamp(time - lastTime, 0.001, 1 / 30);
    lastTime = time;
    const scroll = window.scrollY;
    const now = performance.now();

    // 1. Position de référence, entièrement pilotée par le scroll.
    const range = Math.max(1, geo.endScroll - geo.startScroll);
    const progress = clamp((scroll - geo.startScroll) / range, 0, 1);
    const e = ease(progress);
    const targetX = geo.cx;
    const targetY = geo.cy - scroll;
    const bx = lerp(geo.x0, targetX, e);
    const by = lerp(geo.y0, targetY, e) - Math.sin(Math.PI * e) * geo.amp;
    const scale = lerp(geo.s0, 1, e);

    // 2. Vitesse de la référence (lissée) : sert à l'inclinaison et au rebond.
    if (body.ready) {
      const k = 1 - Math.exp(-dt * 14);
      track.vbx = lerp(track.vbx, (bx - track.bx) / dt, k);
      track.vby = lerp(track.vby, (by - track.by) / dt, k);
    }
    track.bx = bx;
    track.by = by;

    const scrolling = scroll !== track.lastScroll;
    if (scrolling) {
      track.lastMove = now;
      track.wasMoving = true;
    }
    track.lastScroll = scroll;

    if (!body.ready) {
      body.x = bx;
      body.y = by;
      body.ready = true;
    }

    // 3. Suivi ferme de la référence : l'arrêt du scroll arrête le drone presque instantanément.
    const k = 1500;
    const c = 34;
    const steps = 2;
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      body.vx += (k * (bx - body.x) - c * body.vx) * h;
      body.vy += (k * (by - body.y) - c * body.vy) * h;
      body.x += body.vx * h;
      body.y += body.vy * h;
    }

    // 4. À l'arrêt du scroll : petit dépassement amorti, correction d'inclinaison.
    if (!scrolling && track.wasMoving && now - track.lastMove > 70) {
      track.wasMoving = false;
      const speed = Math.hypot(track.vbx, track.vby);
      if (speed > 60) {
        const kick = clamp(speed * 0.24, 0, 300) / speed;
        sway.ovx += track.vbx * kick;
        sway.ovy += track.vby * kick;
        tilt.v += clamp(track.vbx * 0.05, -26, 26);
      }
    }

    // 5. Micro-corrections de stabilisation, aléatoires et discrètes.
    if (time > nextMicro) {
      nextMicro = time + 2.2 + Math.random() * 3.2;
      sway.ovx += (Math.random() - 0.5) * 34;
      sway.ovy += (Math.random() - 0.5) * 26;
      tilt.v += (Math.random() - 0.5) * 7;
    }

    const ks = 62;
    const cs = 5.2;
    for (let i = 0; i < steps; i += 1) {
      sway.ovx += (-ks * sway.ox - cs * sway.ovx) * h;
      sway.ovy += (-ks * sway.oy - cs * sway.ovy) * h;
      sway.ox += sway.ovx * h;
      sway.oy += sway.ovy * h;
      const targetTilt = clamp(track.vbx * 0.011, -9, 9);
      tilt.v += (-95 * (tilt.a - targetTilt) - 7.5 * tilt.v) * h;
      tilt.a += tilt.v * h;
    }

    // 6. Stationnaire : couche indépendante, de moyenne nulle, jamais orientée vers la cible.
    const hoverScale = clamp(geo.size / 520, 0.45, 1);
    const hx = (3.2 * Math.sin(time * 0.9 + 0.4) + 1.7 * Math.sin(time * 2.3 + 1.1)) * hoverScale;
    const hy = (5.2 * Math.sin(time * 1.1) + 2.4 * Math.sin(time * 2.9 + 1.3) + 1.1 * Math.sin(time * 5.3 + 0.2)) * hoverScale;
    const hr = 1.1 * Math.sin(time * 0.8 + 0.6) + 0.6 * Math.sin(time * 1.9 + 2.1) + 0.25 * Math.sin(time * 3.7);

    // 7. Apparition et disparition en fondu aux extrémités du parcours.
    // Le drone s'efface avant de recouvrir le haut de la page (menu) ou la fin de la section.
    const fadeTop = clamp((body.y - 90) / 170, 0, 1);
    const fadeOut = clamp((geo.sectionBottom - scroll - geo.vh * 0.15) / (geo.vh * 0.25), 0, 1);
    visibleOpacity = Math.min(fadeTop, fadeOut);

    const x = body.x + sway.ox + hx;
    const y = body.y + sway.oy + hy;
    const rotation = tilt.a + hr;
    sprite.style.opacity = visibleOpacity.toFixed(3);
    sprite.style.transform =
      `translate3d(${(x - geo.size / 2).toFixed(2)}px, ${(y - geo.size / 2).toFixed(2)}px, 0) ` +
      `rotate(${rotation.toFixed(3)}deg) scale(${(flip ? -scale : scale).toFixed(4)}, ${scale.toFixed(4)})`;
  }

  const trigger = ScrollTrigger.create({
    trigger: section,
    start: () => Math.max(0, geo.startScroll - geo.vh * 0.35),
    end: () => geo.sectionBottom,
    invalidateOnRefresh: true,
    onRefresh: measure,
    onToggle: (self) => {
      active = self.isActive;
      layer.classList.toggle("is-active", active);
      if (active) {
        lastTime = gsap.ticker.time;
        track.lastScroll = window.scrollY;
        body.ready = false;
        track.vbx = 0;
        track.vby = 0;
      }
    }
  });

  measure();
  gsap.ticker.add(frame);

  // Recalcule le trajet dès que la hauteur de la page change après coup (police, images,
  // formulaire déplié, texte du portfolio…) : sinon le drone visait l'ancienne position de son cadre.
  let refreshTimer;
  let lastHeight = document.documentElement.scrollHeight;
  const resizeWatcher = new ResizeObserver(() => {
    const height = document.documentElement.scrollHeight;
    if (height === lastHeight) return;
    lastHeight = height;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 200);
  });
  resizeWatcher.observe(document.body);

  const destroy = () => {
    resizeWatcher.disconnect();
    gsap.ticker.remove(frame);
    trigger.kill();
    layer.remove();
  };
  section._droneDestroy = destroy;
  window.addEventListener("pagehide", destroy, { once: true });
}

function init() {
  document.querySelectorAll("[data-drone-section]").forEach((section) => {
    if (section.dataset.droneReady) return;
    section.dataset.droneReady = "true";
    const { target } = renderSection(section);
    const canFly = Boolean(window.gsap && window.ScrollTrigger) && !reduceMotionQuery.matches;
    if (canFly) {
      mountFlight(section, target, section.dataset.droneFlight === "local" ? "local" : "home", section.dataset.droneFlip === "left");
    } else {
      mountStatic(section, target);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
