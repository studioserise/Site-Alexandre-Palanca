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
// Sur écran tactile, sans survol, le premier toucher retourne la carte et le second mène au formulaire.
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

document.querySelectorAll(".flip-card-grid .flip-card[tabindex]").forEach((card) => {
  if (!contactSection) return;
  card.setAttribute("role", "link");
  card.setAttribute("aria-label", `${card.querySelector("h3")?.textContent ?? "Cette formule"} — demander un devis`);
  card.style.cursor = "pointer";
  const activate = () => {
    if (!canHover && !card.classList.contains("is-flipped")) {
      document.querySelectorAll(".flip-card-grid .flip-card.is-flipped").forEach((other) => other.classList.remove("is-flipped"));
      card.classList.add("is-flipped");
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
      ["images/portraits/personnel-01.jpg", "images/portraits/personnel-02.jpg", "images/portraits/personnel-03.jpg"],
      ["images/portraits/personnel-11.jpg", "images/portraits/personnel-12.jpg", "images/portraits/personnel-13.jpg"],
      ["images/portraits/personnel-21.jpg", "images/portraits/personnel-22.jpg", "images/portraits/personnel-23.jpg"]
    ]
  },
  {
    id: "aftermovie",
    kind: "Vidéo",
    title: "Aftermovie",
    text: "Le film d’un événement, monté pour en retrouver l’énergie et le partager.",
    sets: [["images/video/aftermovie.jpg"]]
  },
  {
    id: "concerts",
    kind: "Photo",
    title: "Concerts",
    text: "Des images au cœur de la scène, pour garder l’énergie d’un live.",
    sets: [
      ["images/evenementiel/concert-01.jpg", "images/evenementiel/concert-02.jpg", "images/evenementiel/concert-03.jpg"],
      ["images/evenementiel/concert-11.jpg", "images/evenementiel/concert-12.jpg", "images/evenementiel/concert-13.jpg"],
      ["images/evenementiel/concert-31.jpg", "images/evenementiel/concert-32.jpg", "images/evenementiel/concert-33.jpg"]
    ]
  },
  {
    id: "clip",
    kind: "Vidéo",
    title: "Clip musical",
    text: "Une mise en images pensée avec l’artiste, de l’intention au montage final.",
    sets: [["images/video/clip-musical.jpg"]]
  },
  {
    id: "lieux",
    kind: "Photo",
    title: "Lieux & savoir-faire",
    text: "Une série cohérente pour révéler les espaces, les gestes et les détails qui vous ressemblent.",
    sets: [
      ["images/Lieux-et-marques/letm-01.jpg", "images/Lieux-et-marques/letm-02.jpg", "images/Lieux-et-marques/letm-03.jpg"]
    ]
  },
  {
    id: "interview",
    kind: "Vidéo",
    title: "Interview filmée",
    text: "Une parole mise en valeur, avec un cadre et un son soignés.",
    sets: [["images/video/interview-portrait.jpg"]]
  },
  {
    id: "portrait-pro",
    kind: "Photo",
    title: "Portrait professionnel",
    text: "Des portraits soignés pour présenter votre activité et votre personnalité.",
    sets: [
      ["images/portraits/professionnel-01.jpg", "images/portraits/professionnel-02.jpg", "images/portraits/professionnel-03.jpg"],
      ["images/portraits/professionnel-11.jpg", "images/portraits/professionnel-12.jpg", "images/portraits/professionnel-13.jpg"]
    ]
  },
  {
    id: "film-presentation",
    kind: "Vidéo",
    title: "Film de présentation",
    text: "Un film qui présente votre activité, votre lieu ou votre savoir-faire.",
    sets: [["images/video/film-presentation.jpg"]]
  },
  {
    id: "festivals",
    kind: "Photo",
    title: "Festivals",
    text: "L’ambiance d’un festival, de la foule aux instants en coulisses.",
    sets: [
      ["images/evenementiel/festival-01.jpg", "images/evenementiel/festival-02.jpg", "images/evenementiel/festival-03.jpg"]
    ]
  },
  {
    id: "captation",
    kind: "Vidéo",
    title: "Captation",
    text: "Un concert ou un événement filmé tel qu’il s’est vécu.",
    sets: [["images/video/captation.jpg"]]
  },
  {
    id: "sport",
    kind: "Photo",
    title: "Portrait sportif",
    text: "Le mouvement, l’effort et la concentration, saisis au bon moment.",
    sets: [
      ["images/portraits/sportif-01.jpg", "images/portraits/sportif-02.jpg", "images/portraits/sportif-03.jpg"]
    ]
  },
  {
    id: "formats-courts",
    kind: "Vidéo",
    title: "Formats courts",
    text: "Des vidéos courtes et rythmées, pensées pour les réseaux sociaux.",
    sets: [["images/video/formats-courts.jpg"]]
  },
  {
    id: "spectacles",
    kind: "Photo",
    title: "Spectacles",
    text: "Des images qui restituent la lumière, le jeu et l’émotion de la scène.",
    sets: [
      ["images/evenementiel/spectacle-01.jpg", "images/evenementiel/spectacle-02.jpg", "images/evenementiel/spectacle-03.jpg"]
    ]
  },
  {
    id: "aerien",
    kind: "Vidéo",
    title: "Prises de vues aériennes",
    text: "Des images en drone pour offrir une autre perspective sur vos lieux et vos événements.",
    sets: [["images/video/prises-aeriennes.jpg"]]
  },
  {
    id: "cabaret",
    kind: "Photo",
    title: "Cabaret",
    text: "L’élégance et le rythme d’une soirée cabaret, au plus près des artistes.",
    sets: [
      ["images/evenementiel/cabaret-01.jpg", "images/evenementiel/cabaret-02.jpg", "images/evenementiel/cabaret-03.jpg"]
    ]
  },
  {
    id: "evenement",
    kind: "Vidéo",
    title: "Tournage d’événement",
    text: "Des images filmées au plus près de vos invités et de vos temps forts.",
    sets: [["images/evenementiel/cabaret-02.jpg"]]
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
          images: ["images/hero-accueil-web.jpg", "images/accueil.jpg", "images/lieux-marques.jpg"]
        },
        {
          title: "Univers de marque",
          text: "Une direction visuelle adaptée au projet, de l’identité aux supports digitaux.",
          images: ["images/Lieux-et-marques/letm-01.jpg", "images/Lieux-et-marques/letm-02.jpg", "images/Lieux-et-marques/letm-03.jpg"]
        },
        {
          title: "Projet sur mesure",
          text: "Des exemples et descriptifs détaillés pourront être ajoutés au fil des réalisations.",
          images: ["images/accueil.jpg", "images/hero-accueil-web.jpg", "images/lieux-marques.jpg"]
        }
      ]
    : carouselProjects;
  let activeProject = 0;
  let activeSet = 0;
  let timerId;
  let transitionId;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SET_DELAY = 3500;     // temps d'affichage d'une série quand un thème en a plusieurs
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
        Object.assign(video, { src: project.video, muted: true, loop: true, autoplay: true, playsInline: true });
        if (set[0]) video.poster = set[0];
        video.setAttribute("aria-label", project.title);
        gallery.append(video);
        video.play().catch(() => {});
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

  const restartTimer = () => {
    window.clearTimeout(timerId);
    if (reduceMotion) return;
    const sets = setsOf(projects[activeProject]);
    timerId = window.setTimeout(() => {
      if (activeSet < sets.length - 1) showSet(activeSet + 1);
      else showProject(activeProject + 1);
      restartTimer();
    }, sets.length > 1 ? SET_DELAY : PROJECT_DELAY);
  };

  previous.addEventListener("click", () => {
    showProject(activeProject - 1);
    restartTimer();
  });
  next.addEventListener("click", () => {
    showProject(activeProject + 1);
    restartTimer();
  });
  carousel.addEventListener("mouseenter", () => window.clearTimeout(timerId));
  carousel.addEventListener("mouseleave", restartTimer);
  // Clic sur une case de la galerie défilante : affiche son thème, sur la même série.
  document.addEventListener("portfolio:show", (event) => {
    const { id, set = 0 } = event.detail || {};
    const index = projects.findIndex((project) => project.id === id);
    if (index < 0) return;
    showProject(index, set);
    restartTimer();
  });
  showProject(0);
  restartTimer();
});

const pressTargets = ".flip-card, .studio-service-card, .studio-about-photo, .studio-approach-photo, .redesign-hero-image:not(.flip-card-face), .portfolio-carousel";
if (window.matchMedia("(hover: hover)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.querySelectorAll(pressTargets).forEach((el) => {
    el.classList.add("press-fx");
    const max = el.matches(".site-footer-card") ? 9 : el.matches(".portfolio-carousel") ? 3 : 7;
    el.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      el.classList.add("is-pointed");
      el.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--mx", `${((1 - x) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    });
    el.addEventListener("pointerleave", () => {
      el.classList.remove("is-pointed");
      ["--rx", "--ry"].forEach((name) => el.style.setProperty(name, "0deg"));
    });
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
