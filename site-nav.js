if (!document.querySelector('script[src^="glow.js"]')) {
  const glowScript = document.createElement("script");
  glowScript.src = "glow.js?v=1";
  glowScript.defer = true;
  document.head.append(glowScript);
}

if (!document.querySelector('link[href^="redesign.css"]')) {
  const redesignStyles = document.createElement("link");
  redesignStyles.rel = "stylesheet";
  redesignStyles.href = "redesign.css?v=36";
  document.head.append(redesignStyles);
}

const siteNav = document.getElementById("site-nav");
const siteNavToggle = document.getElementById("site-nav-toggle");
const siteNavLinks = document.getElementById("site-nav-links");

const themePreference = localStorage.getItem("site-theme");
document.documentElement.dataset.theme = themePreference === "light" ? "light" : "dark";

const publicNavigation = [
  { label: "Photo & vidéo", href: "photo-video.html", files: ["photo-video.html"] },
  { label: "Sites internet", href: "sites-internet.html", files: ["sites-internet.html"] },
  { label: "Contenus réseaux", href: "reseaux.html", files: ["reseaux.html"] },
  { label: "Galerie", href: "galerie.html", files: ["galerie.html"] },
  { label: "Contact", href: "#site-footer", files: [] }
];

if (siteNavLinks) {
  const currentFile = window.location.pathname.split("/").pop() || "index.html";
  siteNavLinks.replaceChildren(...publicNavigation.map(({ label, href, files }) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "site-nav-link";
    link.href = href;
    link.textContent = label;
    if (files.includes(currentFile)) link.setAttribute("aria-current", "page");
    item.append(link);
    return item;
  }));
}

if (siteNav && !siteNav.querySelector(".site-theme-toggle")) {
  const themeToggle = document.createElement("button");
  themeToggle.className = "site-theme-toggle";
  themeToggle.type = "button";
  themeToggle.setAttribute("aria-pressed", String(document.documentElement.dataset.theme === "light"));
  themeToggle.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m13.2 2-8 11h5.7l-.8 9 9.5-12h-6.1L15 2z"></path>
      <path class="site-theme-slash" d="M3 21 21 3"></path>
    </svg>
  `;
  const navInner = siteNav.querySelector(".site-nav-inner");
  navInner.append(themeToggle);

  const syncThemeToggle = () => {
    const isLight = document.documentElement.dataset.theme === "light";
    themeToggle.setAttribute("aria-pressed", String(isLight));
    themeToggle.setAttribute("aria-label", `Activer le mode ${isLight ? "sombre" : "clair"}`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isLight ? "#f1eee8" : "#080807");
  };

  syncThemeToggle();
  themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("site-theme", nextTheme);
    syncThemeToggle();
  });
}

if (siteNav && siteNavToggle && siteNavLinks) {
  function closeMobileNav(restoreFocus = false) {
    siteNav.classList.remove("is-menu-open");
    siteNavToggle.setAttribute("aria-expanded", "false");
    siteNavToggle.setAttribute("aria-label", "Ouvrir le menu");

    if (restoreFocus) {
      siteNavToggle.focus();
    }
  }

  siteNavToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-menu-open");

    siteNavToggle.setAttribute("aria-expanded", String(isOpen));
    siteNavToggle.setAttribute(
      "aria-label",
      isOpen ? "Fermer le menu" : "Ouvrir le menu"
    );
  });

  siteNavLinks.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeMobileNav();
    }
  });

  siteNavLinks.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link?.getAttribute("href") === "#site-footer" && !document.getElementById("site-footer")) {
      window.location.assign("index.html#site-footer");
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!siteNav.contains(event.target)) {
      closeMobileNav();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && siteNav.classList.contains("is-menu-open")) {
      closeMobileNav(true);
    }
  });

  window.matchMedia("(min-width: 801px)").addEventListener("change", (event) => {
    if (event.matches) {
      closeMobileNav();
    }
  });
}

if (!document.querySelector(".site-footer")) {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.id = "site-footer";
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div class="site-footer-contact">
        <p class="site-footer-eyebrow">Un projet à imaginer ?</p>
        <h2>Parlons de votre prochaine histoire.</h2>
        <a class="site-footer-email" href="mailto:info@alexandrepalanca.fr">info@alexandrepalanca.fr</a>
        <a class="site-footer-phone" href="tel:+33679538280">+33 6 79 53 82 80</a>
        <p>Sarlat-la-Canéda · Dordogne &amp; Périgord</p>
        <div class="site-footer-actions">
          <a href="photo-video.html#demande-devis">Photo &amp; vidéo <span aria-hidden="true">↗︎</span></a>
          <a href="sites-internet.html#demande-projet">Site internet <span aria-hidden="true">↗︎</span></a>
        </div>
      </div>
      <div class="site-footer-card-wrap">
      <div class="site-footer-card" tabindex="0" aria-label="Carte de visite Alexandre et Elisa">
        <div class="site-footer-card-inner">
          ${[-3, -2, -1, 0, 1, 2, 3].map((z) => `<span class="site-footer-card-slice" style="--z:${z}px" aria-hidden="true"></span>`).join("")}
          <div class="site-footer-card-face site-footer-card-front">
            <span class="card-ink card-ink--logo" style="--ink: url(images/logo-accueil-carte.png)"><img src="images/logo-accueil-carte.png" alt="" aria-hidden="true"></span>
            <span class="card-ink card-ink--text" style="--ink: url(images/texte-accueil-carte.png)"><img src="images/texte-accueil-carte.png" alt="Alex &amp; Elisa"></span>
          </div>
          <div class="site-footer-card-face site-footer-card-back">
            <img src="images/envers%20carte.png" alt="Alexandre Palanca, photographe — 06 79 53 82 80 — instagram alexpalanca — alexpalanca@gmail.com">
          </div>
        </div>
      </div>
      <p class="site-footer-card-hint">Maintenez le clic et faites glisser pour tourner la carte</p>
      </div>
      <div class="site-footer-legal">
        <span>© ${new Date().getFullYear()} Alex &amp; Elisa</span>
        <a href="mentions-legales.html">Mentions légales</a>
        <a href="politique-confidentialite.html">Politique de confidentialité</a>
      </div>
    </div>
  `;

  const main = document.querySelector("main");
  if (main) {
    main.insertAdjacentElement("afterend", footer);
  } else {
    document.body.append(footer);
  }
}

if (document.querySelector(".site-footer-card") && !document.querySelector('script[src^="footer-card.js"]')) {
  const cardScript = document.createElement("script");
  cardScript.src = "footer-card.js?v=1";
  document.body.append(cardScript);
}
