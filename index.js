/* Accueil : défilement en cascade, animation du logo, position du logo selon l’écran.
   (Sorti de index.html pour la politique de sécurité du site : seuls les fichiers du site peuvent exécuter du code.) */
/* =========================
   2. TRANSITION AU SCROLL
========================= */

const sequence = document.querySelector(".intro-sequence");
const heroLayers = [...document.querySelectorAll(".hero-layer")];
// Agrandissement de chaque plan en fin de défilement (arrière-plan → plan 1)
const heroFade = document.querySelector(".hero-fade");
// L'arrière-plan descend un peu pendant que les plans montent : plus d'écart entre lui et le plan 4.
// (son léger zoom compense sa descente, pour qu'aucun vide n'apparaisse en haut)
const LAYER_GROWTH = [0.05, 0.03, 0.06, 0.09, 0.12]; // léger zoom
const LAYER_RISE = [-4, 8, 12, 17, 22];               // montée en % de la hauteur de l'écran (négatif = descend)
const CSS_SCROLL_ANIMATION = window.CSS && CSS.supports("animation-timeline: view()") &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const overlay = document.getElementById("hero-overlay");
const brand = document.getElementById("hero-brand");
const scrollIndicator = document.getElementById("scroll-indicator");
const heroSideInfo = document.querySelectorAll(".hero-socials, .hero-meta");
const siteNav = document.getElementById("site-nav");

let scrollFrame = null;
let signatureAnimationComplete = false;
let signatureAnimationRun = 0;
let lastScrollY = window.scrollY;
let cancelSignatureDelay = null;

const clamp = (value, min, max) =>
  Math.min(Math.max(value, min), max);

let cachedFade = null;
const fadeColor = () => {
  if (!cachedFade) {
    cachedFade = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [0, 0, 0];
  }
  return cachedFade;
};
new MutationObserver(() => {
  cachedFade = null;
  requestScrollUpdate();
}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

const smoothstep = (value) =>
  value * value * (3 - 2 * value);

function resetSignatureAnimation() {
  signatureAnimationComplete = false;
  brand.classList.remove("is-rotated", "is-positioned", "is-complete");
  brand.style.removeProperty("opacity");
  brand.style.removeProperty("transform");
}

function updateScrollAnimation() {
  const rect = sequence.getBoundingClientRect();
  const currentScrollY = window.scrollY;
  const scrollingDown = currentScrollY > lastScrollY;
  lastScrollY = currentScrollY;

  const totalDistance = sequence.offsetHeight - window.innerHeight;

  const progress = clamp(
    -rect.top / totalDistance,
    0,
    1
  );

  // L'animation du logo ne se joue qu'à l'ouverture de la page : en remontant, il reste dans sa forme finale.

  /*
    Le voile apparaît progressivement.
    L'image reste visible derrière le texte.
  */

  // Le voile arrive après le début de la cascade, pour qu'on la voie.
  const darkProgress = smoothstep(
    clamp((progress - 0.45) / 0.5, 0, 1)
  );

  // Cascade, fondu du bas et voile : gérés par le CSS quand le navigateur sait suivre le défilement
  // (animation-timeline). Sinon, calculés ici à chaque image.
  if (!CSS_SCROLL_ANIMATION) {
    overlay.style.opacity = String(darkProgress);

    /* Cascade des plans : plus un plan est proche, plus il grandit et remonte. */
    const layerProgress = smoothstep(progress);
    heroLayers.forEach((layer, index) => {
      const scale = 1 + LAYER_GROWTH[index] * layerProgress;
      const rise = LAYER_RISE[index] * layerProgress;
      layer.style.transform = `translate3d(0, ${-rise}%, 0) scale(${scale})`;
    });
    // Le fondu du bas remonte avec le plan 1 : en dessous, seulement la couleur de la section suivante.
    heroFade.style.transform = `translateY(${(44 * (1 - layerProgress)).toFixed(2)}%)`;
  }

  if (progress > 0) {
    siteNav.classList.add("is-visible");
  } else {
    siteNav.classList.remove("is-visible");
  }

  scrollIndicator.style.opacity = String(
    1 - clamp(progress * 8, 0, 1)
  );

  const sideInfoOpacity = 1 - clamp(progress * 8, 0, 1);

  heroSideInfo.forEach((element) => {
    element.style.opacity = String(sideInfoOpacity);
    element.style.pointerEvents = sideInfoOpacity < 0.05 ? "none" : "";
  });
}

function requestScrollUpdate() {
  if (scrollFrame) return;

  scrollFrame = requestAnimationFrame(() => {
    updateScrollAnimation();
    scrollFrame = null;
  });
}

window.addEventListener("scroll", requestScrollUpdate, {
  passive: true
});

window.addEventListener("resize", requestScrollUpdate);

async function playSignatureAnimation(run) {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (reducedMotion) {
    if (run !== signatureAnimationRun) return;
    brand.classList.add("is-rotated", "is-positioned", "is-complete");
    signatureAnimationComplete = true;
    requestScrollUpdate();
    return;
  }

  await new Promise((resolve) => {
    const delay = setTimeout(() => {
      cancelSignatureDelay = null;
      resolve();
    }, 1500);

    cancelSignatureDelay = () => {
      clearTimeout(delay);
      cancelSignatureDelay = null;
      resolve();
    };
  });

  if (run !== signatureAnimationRun || signatureAnimationComplete) return;

  const logo = brand.querySelector(".hero-logo");
  const logoPosition = brand.querySelector(".logo-position");
  const signature = brand.querySelector(".hero-signature");

  const duration = 1450;
  const movementLeadIn = 180;
  const movementDuration = duration - movementLeadIn;
  const signatureDuration = 1800;
  const initialLogoTransform = getComputedStyle(logoPosition).transform;

  const rotation = logo.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: "rotate(360deg)" }
    ],
    {
      duration,
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      fill: "forwards"
    }
  );
  const movement = logoPosition.animate(
    [
      { transform: initialLogoTransform },
      { transform: "translateX(0) scale(0.903)" }
    ],
    {
      delay: movementLeadIn,
      duration: movementDuration,
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      fill: "forwards"
    }
  );
  try {
    await Promise.all([rotation.finished, movement.finished]);
  } catch (error) {
    if (run !== signatureAnimationRun && error.name === "AbortError") return;
    throw error;
  }

  if (run !== signatureAnimationRun || signatureAnimationComplete) return;

  brand.classList.add("is-rotated", "is-positioned");
  rotation.cancel();
  movement.cancel();

  const appearance = signature.animate(
    [
      { opacity: 0, transform: "translateX(-12%)" },
      { opacity: 1, transform: "translateX(0)" }
    ],
    {
      duration: signatureDuration,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards"
    }
  );
  try {
    await appearance.finished;
  } catch (error) {
    if (run !== signatureAnimationRun && error.name === "AbortError") return;
    throw error;
  }

  if (run !== signatureAnimationRun || signatureAnimationComplete) return;

  brand.classList.add("is-complete");
  appearance.cancel();

  signatureAnimationComplete = true;
  requestScrollUpdate();
}

function startSignatureAnimation() {
  const run = ++signatureAnimationRun;
  playSignatureAnimation(run).catch((error) => {
    console.error("L'animation de signature a échoué.", error);
  });
}

// Écart entre le centre de l'écran et le centre de la ligne logo + texte (0 quand la ligne est centrée).
const signatureRow = brand.querySelector(".hero-signature-row");
const placeRowShift = () => {
  brand.style.setProperty("--row-shift", "0px");
  const stageBox = document.getElementById("hero-stage").getBoundingClientRect();
  const rowBox = signatureRow.getBoundingClientRect();
  const shift = (stageBox.left + stageBox.width / 2) - (rowBox.left + rowBox.width / 2);
  brand.style.setProperty("--row-shift", `${Math.round(shift)}px`);
};
placeRowShift();
let rowShiftWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth === rowShiftWidth) return; // simple repli de la barre du navigateur mobile
  rowShiftWidth = window.innerWidth;
  placeRowShift();
});

updateScrollAnimation();
startSignatureAnimation();

/* =========================
   3. LOGO TOUJOURS LISIBLE AU DÉPART
   Le logo est glissé entre les plans : les plans 2 et 1 passent devant lui.
   À l'ouverture (avant tout défilement), ils ne peuvent toucher que ses bords : au plus 10 % de sa
   largeur sur un côté, ou 10 % de sa hauteur par le bas, quelle que soit la taille de l'écran.
   On compare le contour réel du logo (ses pixels visibles) avec le haut des plans avant, calés
   exactement comme ils s'affichent (recadrage « cover », calé en bas). Si besoin, le logo remonte
   juste ce qu'il faut ; sinon il reste à sa place.
========================= */
(() => {
  const stage = document.getElementById("hero-stage");
  const row = brand.querySelector(".hero-signature-row");
  const logoBox = brand.querySelector(".logo-position");
  const signature = brand.querySelector(".hero-signature");
  const MAX_HIDDEN = 0.09; // 10 % autorisés, 9 % visés pour garder une petite marge d'arrondi
  // le logo apparaît seul, en plus grand, avant de se placer
  const startScale = () => parseFloat(getComputedStyle(row).getPropertyValue("--logo-start-scale")) || 1.625;

  const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

  // Pour chaque colonne d'une image : premier (top) ou dernier (bottom) pixel visible.
  const readAlpha = (images, maxWidth = Infinity) => {
    const ratio = Math.min(1, maxWidth / images[0].naturalWidth);
    const w = Math.round(images[0].naturalWidth * ratio), h = Math.round(images[0].naturalHeight * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    images.forEach((image) => context.drawImage(image, 0, 0, w, h));
    const data = context.getImageData(0, 0, w, h).data;
    const top = new Float32Array(w).fill(-1), bottom = new Float32Array(w).fill(-1);
    let minY = h, maxY = -1;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (data[(y * w + x) * 4 + 3] > 128) {
          if (top[x] < 0) top[x] = y;
          bottom[x] = y + 1;
        }
      }
      if (top[x] >= 0) { minY = Math.min(minY, top[x]); maxY = Math.max(maxY, bottom[x]); }
    }
    let minX = 0, maxX = w;
    while (minX < w && top[minX] < 0) minX++;
    while (maxX > 0 && top[maxX - 1] < 0) maxX--;
    return { w, h, top, bottom, minX, maxX, minY, maxY };
  };

  let front = null, text = null, mark = null;

  // Haut des plans avant à l'écran, à l'abscisse x.
  const frontTop = (x, stageBox) => {
    const scale = Math.max(stageBox.width / front.w, stageBox.height / front.h);
    const offsetX = (stageBox.width - front.w * scale) / 2;
    const offsetY = stageBox.height - front.h * scale;
    const column = Math.floor((x - stageBox.left - offsetX) / scale);
    if (column < 0 || column >= front.w) return Infinity;
    const top = front.top[column];
    return top < 0 ? Infinity : stageBox.top + offsetY + top * scale;
  };

  // Contour réel (pixels visibles) d'une image dessinée dans le cadre box, à l'écran.
  const outline = (shape, box) => ({
    left: box.left + (shape.minX / shape.w) * box.width,
    right: box.left + (shape.maxX / shape.w) * box.width,
    top: box.top + (shape.minY / shape.h) * box.height,
    bottom: box.top + (shape.maxY / shape.h) * box.height
  });
  const union = (a, b) => ({
    left: Math.min(a.left, b.left), right: Math.max(a.right, b.right),
    top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom)
  });

  // Les plans avant peuvent seulement « grignoter » les bords du logo :
  // au plus 10 % de sa largeur sur chaque côté, et 10 % de sa hauteur par le bas.
  // Le cœur du logo (au-delà de ces 10 %) doit rester entièrement visible.
  const liftFor = (area, stageBox) => {
    const width = area.right - area.left, height = area.bottom - area.top;
    const limit = area.bottom - height * MAX_HIDDEN;
    let lift = 0;
    for (let x = Math.ceil(area.left + width * MAX_HIDDEN); x <= area.right - width * MAX_HIDDEN; x++) {
      lift = Math.max(lift, limit - frontTop(x, stageBox));
    }
    return lift;
  };

  const placeLogo = () => {
    if (!front) return;
    brand.style.setProperty("--logo-lift", "0px");
    const stageBox = stage.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();

    // Position finale des lettres (sans les décalages de l'animation)
    const textBox = {
      left: rowBox.left + signature.offsetLeft, top: rowBox.top + signature.offsetTop,
      width: signature.offsetWidth, height: signature.offsetHeight
    };
    // Le logo est une image 16:9 trois fois et un tiers plus large que sa case carrée, centrée dessus.
    const size = logoBox.offsetWidth;
    const logoAt = (centerX, centerY, scale) => {
      const width = size * 3.33333 * scale;
      const height = width * 9 / 16;
      return { left: centerX - width / 2, top: centerY - height / 2, width, height };
    };
    const finalLogo = logoAt(rowBox.left + logoBox.offsetLeft + size / 2, rowBox.top + logoBox.offsetTop + size / 2, 1);
    const rowShift = parseFloat(getComputedStyle(brand).getPropertyValue("--row-shift")) || 0;
    const startLogo = logoAt(rowBox.left + rowBox.width / 2 + rowShift, rowBox.top + rowBox.height / 2, startScale());

    const finalArea = union(outline(text, textBox), outline(mark, finalLogo)); // logo + « Alexandre Palanca »
    const startArea = outline(mark, startLogo);                                 // logo seul, au début
    let lift = Math.max(liftFor(finalArea, stageBox), liftFor(startArea, stageBox));
    // Ne pas monter sous le menu : au moins 12 % de l'écran au-dessus du logo.
    const room = Math.min(rowBox.top, startLogo.top + (mark.minY / mark.h) * startLogo.height) - stageBox.top - stageBox.height * 0.12;
    lift = Math.max(0, Math.min(lift, room));
    brand.style.setProperty("--logo-lift", `${Math.round(lift)}px`);
  };

  Promise.all([
    // Les plans 2 et 1 déjà affichés sont réutilisés : rien n'est téléchargé en plus.
    Promise.all([...document.querySelectorAll('.hero-layer[data-depth="3"], .hero-layer[data-depth="4"]')].map((layer) =>
      layer.complete && layer.naturalWidth ? Promise.resolve(layer) : new Promise((resolve, reject) => {
        layer.addEventListener("load", () => resolve(layer), { once: true });
        layer.addEventListener("error", reject, { once: true });
      }))),
    loadImage(signature.currentSrc || signature.src),
    loadImage(brand.querySelector(".hero-logo").currentSrc || brand.querySelector(".hero-logo").src)
  ]).then(([frontImages, textImage, logoImage]) => {
    // Calcul fait dès que le navigateur a un moment libre (au plus tard 600 ms), pour ne pas
    // freiner l'affichage de la page ; l'animation du logo ne démarre qu'après 1,5 s.
    const compute = () => {
      front = readAlpha(frontImages, 1200);
      text = readAlpha([textImage]);
      mark = readAlpha([logoImage]);
      placeLogo();
    };
    if ("requestIdleCallback" in window) requestIdleCallback(compute, { timeout: 600 });
    else setTimeout(compute, 0);
  }).catch(() => {});

  let resizeTimer = null;
  let logoWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === logoWidth) return; // simple repli de la barre du navigateur mobile
    logoWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(placeLogo, 150);
  });
})();
