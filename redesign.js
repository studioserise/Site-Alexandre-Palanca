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

document.querySelectorAll(".flip-card[tabindex]").forEach((card) => {
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

const carouselProjects = [
  {
    title: "Portraits",
    text: "Une présence simple, des images naturelles et une séance pensée à votre rythme.",
    images: ["images/portraits/hero-portraits-nb.jpg", "images/portraits/hero-portraits-nb.jpg", "images/portraits/hero-portraits-nb.jpg"]
  },
  {
    title: "Événementiel",
    text: "Des images au cœur de l’action, pour garder une trace vivante de vos événements.",
    images: ["images/evenementiel/concert-01.jpg", "images/evenementiel/festival-01.jpg", "images/evenementiel/spectacle-01.jpg"]
  },
  {
    title: "Lieux & savoir-faire",
    text: "Une série cohérente pour révéler les espaces, les gestes et les détails qui vous ressemblent.",
    images: ["images/Lieux-et-marques/letm-01.jpg", "images/Lieux-et-marques/letm-02.jpg", "images/Lieux-et-marques/letm-03.jpg"]
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
  let intervalId;
  let transitionId;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const showProject = (index) => {
    activeProject = (index + projects.length) % projects.length;
    const project = projects[activeProject];
    const gallery = carousel.querySelector("[data-carousel-images]");
    window.clearTimeout(transitionId);
    gallery.classList.add("is-changing");
    transitionId = window.setTimeout(() => {
      project.images.forEach((src, imageIndex) => {
        images[imageIndex].src = src;
        images[imageIndex].alt = `${project.title} — image ${imageIndex + 1}`;
      });
      description.replaceChildren();
      const title = document.createElement("h3");
      title.textContent = project.title;
      const text = document.createElement("p");
      text.textContent = project.text;
      description.append(title, text);
      gallery.classList.remove("is-changing");
    }, 180);
  };

  const restartTimer = () => {
    window.clearInterval(intervalId);
    if (reduceMotion) return;
    intervalId = window.setInterval(() => showProject(activeProject + 1), 5000);
  };

  previous.addEventListener("click", () => {
    showProject(activeProject - 1);
    restartTimer();
  });
  next.addEventListener("click", () => {
    showProject(activeProject + 1);
    restartTimer();
  });
  carousel.addEventListener("mouseenter", () => window.clearInterval(intervalId));
  carousel.addEventListener("mouseleave", restartTimer);
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
