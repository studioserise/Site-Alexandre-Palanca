const quotes = [
  {
    text: "Votre retour d’expérience apparaîtra ici.",
    author: "Témoignage client à ajouter"
  },
  {
    text: "Quelques mots sur votre collaboration pourront être partagés sur cette page.",
    author: "Témoignage client à ajouter"
  },
  {
    text: "Cette section accueillera bientôt les avis des personnes accompagnées.",
    author: "Témoignage client à ajouter"
  }
];

const quoteButtons = document.querySelectorAll(".studio-person[data-quote]");
const quoteText = document.getElementById("studio-quote-text");
const quoteAuthor = document.getElementById("studio-quote-author");

const HOLD_MS = 7000;
const SELECT_MS = 650;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let typingTimer = 0;
let cycleTimer = 0;
let cycleStarted = false;
let current = Math.max([...quoteButtons].findIndex((b) => b.classList.contains("is-selected")), 0);

function selectPerson(index) {
  current = index;
  quoteButtons.forEach((item, i) => {
    item.classList.toggle("is-selected", i === index);
    item.setAttribute("aria-pressed", String(i === index));
  });
}

function typeQuote(quote, onDone) {
  clearInterval(typingTimer);
  const full = `« ${quote.text} »`;
  quoteText.classList.remove("is-selecting");
  quoteAuthor.textContent = "";
  quoteAuthor.style.opacity = "0";
  if (reducedMotion.matches) {
    quoteText.textContent = full;
    quoteAuthor.textContent = quote.author;
    quoteAuthor.style.opacity = "1";
    onDone();
    return;
  }
  quoteText.textContent = "";
  let index = 0;
  typingTimer = setInterval(() => {
    index += 1;
    quoteText.textContent = full.slice(0, index);
    if (index >= full.length) {
      clearInterval(typingTimer);
      quoteAuthor.textContent = quote.author;
      quoteAuthor.style.opacity = "1";
      onDone();
    }
  }, 38);
}

// Frappe, pause de 7 s, sélection du texte, effacement d'un coup, puis témoignage suivant.
function playQuote(index) {
  clearTimeout(cycleTimer);
  selectPerson(index);
  typeQuote(quotes[index], () => {
    cycleTimer = setTimeout(() => {
      quoteText.classList.add("is-selecting");
      window.getSelection()?.selectAllChildren(quoteText);
      cycleTimer = setTimeout(() => {
        quoteText.classList.remove("is-selecting");
        window.getSelection()?.removeAllRanges();
        quoteText.textContent = "";
        quoteAuthor.textContent = "";
        quoteAuthor.style.opacity = "0";
        cycleTimer = setTimeout(() => playQuote((index + 1) % quotes.length), 450);
      }, reducedMotion.matches ? 0 : SELECT_MS);
    }, HOLD_MS);
  });
}

quoteButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selected = Number(button.dataset.quote);
    if (!quotes[selected] || !cycleStarted || (selected === current && button.classList.contains("is-selected"))) return;
    playQuote(selected);
  });
});

const testimonials = document.querySelector(".studio-testimonials");
if (quoteText && testimonials) {
  const startObserver = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    startObserver.disconnect();
    cycleStarted = true;
    playQuote(current);
  }, { threshold: 0.4 });
  startObserver.observe(testimonials);
}

// Cartes des formules : un clic renvoie vers le formulaire de contact de la page (qui s'ouvre tout seul).
// Sur écran tactile, chaque toucher retourne la carte ; le formulaire est juste en dessous.
const contactSection = document.querySelector("[data-contact-reveal]")?.closest("section[id]");
const canHover = window.matchMedia("(hover: hover)").matches;
const goToContact = () => {
  const hash = `#${contactSection.id}`;
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    contactSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    location.hash = hash;
  }
};

// Écran tactile : les indications « Survolez… » deviennent « Touchez pour découvrir ».
if (!canHover) {
  document.querySelectorAll(".flip-card .flip-hint").forEach((hint) => {
    if (/survolez/i.test(hint.textContent)) hint.textContent = "Touchez pour découvrir ↻\uFE0E";
  });
}

document.querySelectorAll(".flip-card-grid .flip-card[tabindex]").forEach((card) => {
  if (!contactSection) return;
  card.setAttribute("role", "link");
  card.setAttribute("aria-label", `${card.querySelector("h3")?.textContent ?? "Cette formule"} — demander un devis`);
  card.style.cursor = "pointer";
  // Ordinateur : un clic mène au formulaire. Écran tactile : chaque toucher retourne la carte (recto ↔ verso).
  const activate = () => {
    if (!canHover) {
      card.classList.toggle("is-flipped");
      return;
    }
    card.classList.remove("is-flipped");
    goToContact();
  };
  card.addEventListener("click", activate);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      card.classList.remove("is-flipped");
      goToContact();
    }
  });
  card.dataset.contactLink = "true";
});

document.querySelectorAll(".flip-card[tabindex]:not([data-contact-link])").forEach((card) => {
  const toggle = () => {
    const isFlipped = card.classList.toggle("is-flipped");
    card.setAttribute("aria-pressed", String(isFlipped));
  };
  card.setAttribute("role", "button");
  card.setAttribute("aria-pressed", "false");
  card.addEventListener("click", toggle);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  });
});

// Portfolio photo et vidéo : alterne un thème photo et un projet vidéo.
// Un thème photo peut avoir plusieurs séries de 3 images (`sets`) : elles défilent dans les cadres, le texte reste.
// `id` + numéro de série (0, 1, 2…) relient chaque case des galeries défilantes à sa série
// (attributs data-portfolio et data-set dans photo-video.html).
// Pour un projet vidéo, ajouter plus tard `video: "chemin/vers/film.mp4"` : la vidéo remplacera l'image.
const carouselProjects = [
  {
    id: "portraits",
    kind: "Photo",
    title: "Portraits",
    text: "Une présence simple, des images naturelles et une séance pensée à votre rythme.",
    sets: [
      ["images/portraits/personnel-01-1200.webp", "images/portraits/personnel-02-1200.webp", "images/portraits/personnel-03-1200.webp"],
      ["images/portraits/personnel-11-1200.webp", "images/portraits/personnel-12-1200.webp", "images/portraits/personnel-13-1200.webp"],
      ["images/portraits/personnel-21-1200.webp", "images/portraits/personnel-22-1200.webp", "images/portraits/personnel-23-1200.webp"]
    ]
  },
  {
    id: "aftermovie",
    kind: "Vidéo",
    title: "Aftermovie",
    text: "Le film d’un événement, monté pour en retrouver l’énergie et le partager.",
    sets: [["images/video/aftermovie-affiche-1200.webp"]],
    video: "images/video/aftermovie-720.mp4"
  },
  {
    id: "concerts",
    kind: "Photo",
    title: "Concerts",
    text: "Des images au cœur de la scène, pour garder l’énergie d’un live.",
    sets: [
      ["images/evenementiel/concert-01-1200.webp", "images/evenementiel/concert-02-1200.webp", "images/evenementiel/concert-03-1200.webp"],
      ["images/evenementiel/concert-11-1200.webp", "images/evenementiel/concert-12-1200.webp", "images/evenementiel/concert-13-1200.webp"],
      ["images/evenementiel/concert-31-1200.webp", "images/evenementiel/concert-32-1200.webp", "images/evenementiel/concert-33-1200.webp"]
    ]
  },
  {
    id: "captation",
    kind: "Vidéo",
    title: "Captation",
    text: "Un concert ou un spectacle filmé tel qu’il s’est vécu, au plus près de la scène.",
    sets: [["images/video/captation-affiche-1200.webp"]],
    video: "images/video/captation-720.mp4"
  },
  {
    id: "festivals",
    kind: "Photo",
    title: "Festivals",
    text: "L’ambiance d’un festival, de la foule aux instants en coulisses.",
    sets: [
      ["images/evenementiel/festival-01-1200.webp", "images/evenementiel/festival-02-1200.webp", "images/evenementiel/festival-03-1200.webp"]
    ]
  },
  {
    id: "interview",
    kind: "Vidéo",
    title: "Interview filmée",
    text: "Une parole mise en valeur, avec un cadre et un son soignés.",
    sets: [["images/video/interview-affiche-1200.webp"]],
    video: "images/video/interview-720.mp4",
    videoPosition: "center 30%" // vidéo verticale : on garde le visage dans le cadre
  },
  {
    id: "sport",
    kind: "Photo",
    title: "Sport & compétition",
    text: "Le mouvement, l’effort et la concentration, saisis au bon moment.",
    sets: [
      ["images/evenementiel/sport-competition-01-1200.webp", "images/evenementiel/sport-competition-02-1200.webp", "images/evenementiel/sport-competition-03-1200.webp"],
      ["images/evenementiel/sport-competition-11-1200.webp", "images/evenementiel/sport-competition-12-1200.webp", "images/evenementiel/sport-competition-13-1200.webp"]
    ]
  },
  {
    id: "formats-courts",
    kind: "Vidéo",
    title: "Formats courts",
    text: "Des vidéos courtes et rythmées, pensées pour les réseaux sociaux.",
    sets: [["images/video/formats-courts-1200.webp"]],
    video: "images/video/formats-courts-720.mp4",
    videoPosition: "right center" // cadrage de la vidéo dans le portfolio
  },
  {
    id: "cabaret",
    kind: "Photo",
    title: "Cabaret",
    text: "L’élégance et le rythme d’une soirée cabaret, au plus près des artistes.",
    sets: [
      ["images/evenementiel/cabaret-31-1200.webp", "images/evenementiel/cabaret-32-1200.webp", "images/evenementiel/cabaret-33-1200.webp"],
      ["images/evenementiel/cabaret-11-1200.webp", "images/evenementiel/cabaret-12-1200.webp", "images/evenementiel/cabaret-13-1200.webp"],
      ["images/evenementiel/cabaret-01-1200.webp", "images/evenementiel/cabaret-02-1200.webp", "images/evenementiel/cabaret-03-1200.webp"],
      ["images/evenementiel/cabaret-21-1200.webp", "images/evenementiel/cabaret-22-1200.webp", "images/evenementiel/cabaret-23-1200.webp"],
      ["images/portraits/professionnel-11-1200.webp", "images/portraits/professionnel-12-1200.webp", "images/portraits/professionnel-13-1200.webp"]
    ]
  },
  {
    id: "aerien",
    kind: "Vidéo",
    title: "Prises de vues aériennes",
    text: "Des images en drone pour offrir une autre perspective sur vos lieux et vos événements.",
    sets: [["images/video/prises-aeriennes-1200.webp"]],
    video: "images/video/prises-aeriennes-720.mp4"
  }
];

document.querySelectorAll("[data-carousel]").forEach((carousel) => {
  const images = [...carousel.querySelectorAll("[data-carousel-images] img")];
  const description = carousel.querySelector("[data-carousel-description]");
  const previous = carousel.querySelector("[data-carousel-prev]");
  const next = carousel.querySelector("[data-carousel-next]");
  if (images.length !== 3 || !description || !previous || !next) return;

  const isWebPortfolio = document.getElementById("web-portfolio-title") !== null;
  const projects = isWebPortfolio
    ? [
        {
          title: "Site vitrine",
          text: "Un aperçu du travail de conception et de mise en page, à remplacer par les mockups des réalisations.",
          images: ["images/hero-accueil-web-1200.webp", "images/accueil-1200.webp", "images/lieux-marques-1200.webp"]
        },
        {
          title: "Univers de marque",
          text: "Une direction visuelle adaptée au projet, de l’identité aux supports digitaux.",
          images: ["images/Lieux-et-marques/letm-01-1200.webp", "images/Lieux-et-marques/letm-02-1200.webp", "images/Lieux-et-marques/letm-03-1200.webp"]
        },
        {
          title: "Projet sur mesure",
          text: "Des exemples et descriptifs détaillés pourront être ajoutés au fil des réalisations.",
          images: ["images/accueil-1200.webp", "images/hero-accueil-web-1200.webp", "images/lieux-marques-1200.webp"]
        }
      ]
    : carouselProjects;
  let activeProject = 0;
  let activeSet = 0;
  let timerId;
  let transitionId;
  let fromReel = false; // arrivé depuis une case de la galerie : on enchaîne les séries de ce thème
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SET_DELAY = 4000;     // temps d'affichage d'une série quand un thème en a plusieurs
  const PROJECT_DELAY = 5000; // temps d'affichage d'un thème qui n'a qu'une série

  const gallery = carousel.querySelector("[data-carousel-images]");
  let video = null;
  const setsOf = (project) => project.sets || [project.images];
  const clearSwaps = () => gallery.querySelectorAll(".portfolio-swap").forEach((layer) => layer.remove());
  const altFor = (project, single, index) => (single ? project.title : `${project.title} — image ${index + 1}`);

  // Changement de thème : fondu de la mosaïque, nouveau texte.
  const showProject = (index, setIndex = 0) => {
    activeProject = (index + projects.length) % projects.length;
    const project = projects[activeProject];
    const sets = setsOf(project);
    activeSet = Math.min(Math.max(setIndex, 0), sets.length - 1);
    const set = sets[activeSet];
    window.clearTimeout(transitionId);
    gallery.classList.add("is-changing");
    transitionId = window.setTimeout(() => {
      clearSwaps();
      const single = set.length === 1 || Boolean(project.video);
      gallery.classList.toggle("is-single", single);
      images.forEach((image, imageIndex) => {
        const src = set[imageIndex];
        image.hidden = !src || (imageIndex === 0 && Boolean(project.video));
        if (!src) return;
        image.src = src;
        image.alt = altFor(project, single, imageIndex);
      });

      // Projet vidéo avec un fichier : la vidéo prend la place de l'image.
      if (video) { video.pause(); video.remove(); video = null; }
      if (project.video) {
        video = document.createElement("video");
        // La vidéo est lue une fois en entier, puis on passe à la case suivante.
        // Certains navigateurs (dont l'aperçu de VS Code) ne lisent pas le .mp4 : on prend alors la version .webm.
        const mp4Ok = video.canPlayType('video/mp4; codecs="avc1.64001F"');
        const src = !mp4Ok && /\.mp4$/i.test(project.video) ? project.video.replace(/\.mp4$/i, ".webm") : project.video;
        Object.assign(video, { src, muted: true, loop: false, autoplay: true, playsInline: true });
        video.addEventListener("ended", goNext);
        if (project.videoPosition) video.style.objectPosition = project.videoPosition;
        if (set[0]) video.poster = set[0];
        video.setAttribute("aria-label", project.title);
        gallery.append(video);
        // Si la vidéo ne peut pas se lire (lecture auto bloquée, fichier manquant), on ne reste pas bloqué.
        const fallback = () => { if (video && !video.ended) { window.clearTimeout(timerId); timerId = window.setTimeout(goNext, PROJECT_DELAY); } };
        video.addEventListener("error", fallback);
        video.play().catch(fallback);
      }

      description.replaceChildren();
      if (project.kind) {
        const kind = document.createElement("span");
        kind.className = "studio-eyebrow portfolio-kind";
        kind.textContent = project.kind;
        description.append(kind);
      }
      const title = document.createElement("h3");
      title.textContent = project.title;
      const text = document.createElement("p");
      text.textContent = project.text;
      description.append(title, text);
      gallery.classList.remove("is-changing");
    }, 180);
  };

  // Série suivante du même thème : chaque image se renouvelle dans son propre cadre, le texte ne bouge pas.
  const showSet = (setIndex) => {
    const project = projects[activeProject];
    const sets = setsOf(project);
    activeSet = (setIndex + sets.length) % sets.length;
    const set = sets[activeSet];
    clearSwaps();
    images.forEach((image, imageIndex) => {
      const src = set[imageIndex];
      if (!src || image.hidden) return;
      const alt = altFor(project, false, imageIndex);
      if (reduceMotion) { image.src = src; image.alt = alt; return; }
      const layer = new Image();
      layer.className = "portfolio-swap";
      layer.alt = "";
      layer.src = src;
      Object.assign(layer.style, {
        left: `${image.offsetLeft}px`,
        top: `${image.offsetTop}px`,
        width: `${image.offsetWidth}px`,
        height: `${image.offsetHeight}px`,
        animationDelay: `${imageIndex * 140}ms`
      });
      const start = () => {
        if (projects[activeProject] !== project) return;
        gallery.append(layer);
        layer.addEventListener("animationend", () => {
          image.src = src;
          image.alt = alt;
          const done = () => layer.remove();
          (image.decode ? image.decode() : Promise.resolve()).then(done, done);
        }, { once: true });
      };
      (layer.decode ? layer.decode() : Promise.resolve()).then(start, start);
    });
  };

  let hovering = false;
  // Passe au cadre suivant (fin d'une vidéo) ; si la souris est sur le portfolio,
  // le cadre suivant reste affiché jusqu'à ce qu'elle sorte, comme d'habitude.
  const goNext = () => {
    showProject(activeProject + 1);
    if (hovering && !fromReel) window.clearTimeout(timerId);
    else restartTimer();
  };
  const restartTimer = () => {
    window.clearTimeout(timerId);
    // Projet vidéo : pas de minuterie, on attend la fin de la vidéo
    // (si elle s'est terminée pendant le survol, on repart dès que la souris sort).
    if (projects[activeProject].video) {
      if (video && video.ended) timerId = window.setTimeout(goNext, 600);
      return;
    }
    if (reduceMotion) return;
    const sets = setsOf(projects[activeProject]);
    timerId = window.setTimeout(() => {
      if (fromReel && sets.length > 1) showSet(activeSet + 1);
      else if (activeSet < sets.length - 1) showSet(activeSet + 1);
      else showProject(activeProject + 1);
      restartTimer();
    }, sets.length > 1 ? SET_DELAY : PROJECT_DELAY);
  };

  previous.addEventListener("click", () => {
    fromReel = false;
    showProject(activeProject - 1);
    restartTimer();
  });
  next.addEventListener("click", () => {
    fromReel = false;
    showProject(activeProject + 1);
    restartTimer();
  });
  // Survol : pause, sauf si on vient de la galerie (les séries continuent de défiler).
  carousel.addEventListener("mouseenter", () => { hovering = true; if (!fromReel) window.clearTimeout(timerId); });
  carousel.addEventListener("mouseleave", () => { hovering = false; if (!fromReel) restartTimer(); });
  // Écran tactile : glisser le doigt vers la gauche ou la droite change de projet (en plus des flèches).
  let swipe = null;
  carousel.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    swipe = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true });
  carousel.addEventListener("touchend", (event) => {
    if (!swipe) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipe.x, dy = touch.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // geste trop court ou plutôt vertical (défilement)
    fromReel = false;
    showProject(activeProject + (dx < 0 ? 1 : -1));
    restartTimer();
  }, { passive: true });
  // Clic sur une case de la galerie défilante : affiche son thème, sur la même série.
  document.addEventListener("portfolio:show", (event) => {
    const { id, set = 0 } = event.detail || {};
    const index = projects.findIndex((project) => project.id === id);
    if (index < 0) return;
    fromReel = true;
    showProject(index, set);
    restartTimer();
  });
  showProject(0);
  restartTimer();
});

const pressTargets = ".flip-card, .studio-service-card, .studio-about-photo, .studio-approach-photo, .redesign-hero-image:not(.flip-card-face), .portfolio-carousel";
if (window.matchMedia("(hover: hover)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  // Survol « carte en main » : légère inclinaison vers la souris, petit soulèvement et reflet.
  // - Mouvement lissé image par image (pas de transition CSS relancée à chaque mouvement).
  // - Le cadre est mesuré une seule fois à l'arrivée de la souris : mesuré pendant l'inclinaison,
  //   il changeait sans cesse et la carte vibrait.
  // - Un court repos après la sortie empêche la carte de se réarmer en boucle sur un bord.
  document.querySelectorAll(pressTargets).forEach((el) => {
    el.classList.add("press-fx");
    const max = el.matches(".portfolio-carousel") ? 1.5 : 4; // inclinaison maximale en degrés
    const lift = el.matches(".portfolio-carousel") ? 1.004 : 1.012;
    const current = { rx: 0, ry: 0, ps: 1 };
    const target = { rx: 0, ry: 0, ps: 1 };
    let box = null;
    let frame = 0;
    let restUntil = 0;
    // Valeurs de départ posées sur la carte : les anciennes règles CSS ne peuvent plus imposer d'à-coup.
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--ps", "1");

    const step = () => {
      frame = 0;
      let moving = false;
      for (const key of ["rx", "ry", "ps"]) {
        const gap = target[key] - current[key];
        if (Math.abs(gap) > (key === "ps" ? 0.0002 : 0.01)) {
          current[key] += gap * 0.14;
          moving = true;
        } else {
          current[key] = target[key];
        }
      }
      el.style.setProperty("--rx", `${current.rx.toFixed(3)}deg`);
      el.style.setProperty("--ry", `${current.ry.toFixed(3)}deg`);
      el.style.setProperty("--ps", current.ps.toFixed(4));
      if (moving) frame = requestAnimationFrame(step);
    };
    const animate = () => { if (!frame) frame = requestAnimationFrame(step); };

    const update = (event) => {
      if (!box) return;
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!inside) { release(); return; }
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      target.rx = (0.5 - y) * 2 * max;
      target.ry = (x - 0.5) * 2 * max;
      target.ps = lift;
      el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--mx", `${((1 - x) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
      animate();
    };
    const release = () => {
      if (!box) return;
      box = null;
      restUntil = performance.now() + 450;
      document.removeEventListener("pointermove", update);
      window.removeEventListener("scroll", release);
      el.classList.remove("is-pointed");
      Object.assign(target, { rx: 0, ry: 0, ps: 1 });
      animate();
    };
    const arm = (event) => {
      if (event.pointerType !== "mouse" || box || performance.now() < restUntil) return;
      box = el.getBoundingClientRect();
      el.classList.add("is-pointed");
      document.addEventListener("pointermove", update, { passive: true });
      window.addEventListener("scroll", release, { passive: true });
      update(event);
    };
    el.addEventListener("pointerenter", arm);
    el.addEventListener("pointermove", arm);
  });
}

// Apparitions douces au défilement (translate/opacity, sans toucher au transform des effets existants).
(() => {
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const containers = [
    ".redesign-hero", ".redesign-section", ".studio-about", ".studio-services",
    ".studio-approach", ".studio-testimonials", ".redesign-development"
  ].join(",");
  const groups = ".flip-card-grid, .studio-service-grid";
  const targets = [];

  document.querySelectorAll(containers).forEach((section) => {
    if (section.closest("[data-drone-section], .intro-sequence")) return;
    Array.from(section.children).forEach((child) => {
      if (child.matches(groups)) {
        Array.from(child.children).forEach((card, i) => targets.push([card, i * 110]));
      } else {
        targets.push([child, 0]);
      }
    });
  });
  if (!targets.length) return;

  const footer = document.querySelector(".site-footer-inner");
  if (footer) targets.push([footer, 0]);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      observer.unobserve(el);
      el.classList.add("rv-in");
      setTimeout(() => el.classList.remove("rv", "rv-in"), 1100 + Number(el.dataset.rvDelay || 0));
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

  targets.forEach(([el, delay]) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.9 && r.bottom > 0) return; // déjà visible au chargement
    el.dataset.rvDelay = delay;
    el.style.setProperty("--rv-delay", `${delay}ms`);
    el.classList.add("rv");
    observer.observe(el);
  });
})();
