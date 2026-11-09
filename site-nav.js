if (!document.querySelector('script[src^="glow.js"]')) {
  const glowScript = document.createElement("script");
  glowScript.src = "glow.js?v=3";
  glowScript.defer = true;
  document.head.append(glowScript);
}

if (!document.querySelector('link[href^="redesign.css"]')) {
  const redesignStyles = document.createElement("link");
  redesignStyles.rel = "stylesheet";
  redesignStyles.href = "redesign.css?v=66";
  document.head.append(redesignStyles);
}

const siteNav = document.getElementById("site-nav");
const siteNavToggle = document.getElementById("site-nav-toggle");
const siteNavLinks = document.getElementById("site-nav-links");

// Mode sombre par défaut (ordinateur et mobile). Le choix du visiteur est mémorisé ensuite.
// Nouvelle clé « site-theme-v2 » : les anciens choix « clair » sont oubliés, tout le monde repart en sombre.
const THEME_KEY = "site-theme-v2";
let themePreference = null;
try { themePreference = localStorage.getItem(THEME_KEY); } catch (error) { /* stockage indisponible */ }
document.documentElement.dataset.theme = themePreference === "light" ? "light" : "dark";

const publicNavigation = [
  { label: "Photo & vidéo", href: "photo-video.html", files: ["photo-video.html"] },
  { label: "Sites internet", href: "sites-internet.html", files: ["sites-internet.html"] },
  { label: "Contenus réseaux", href: "reseaux.html", files: ["reseaux.html"] },
  { label: "Espace client", href: "galerie.html", files: ["galerie.html", "galerie-privee.html", "suivi-site.html", "contenus-reseaux.html"] },
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
  // Ordinateur : à droite du menu. Mobile : dans le menu déroulant, sous « Contact ».
  const themeItem = document.createElement("li");
  themeItem.className = "site-nav-theme-item";
  const mobileNav = window.matchMedia("(max-width: 800px)");
  // Bouton de langue (FR / EN), placé juste avant l'éclair. Il affiche la langue vers laquelle il bascule.
  const langToggle = document.createElement("button");
  langToggle.className = "site-lang-toggle";
  langToggle.type = "button";
  const syncLangToggle = () => {
    const english = window.siteI18n?.lang() === "en";
    langToggle.textContent = english ? "FR" : "EN";
    langToggle.setAttribute("lang", english ? "fr" : "en");
    langToggle.setAttribute("aria-label", english ? "Passer le site en français" : "Switch the site to English");
  };
  syncLangToggle();
  langToggle.addEventListener("click", () => {
    window.siteI18n?.toggle();
    syncLangToggle();
  });
  if (!window.siteI18n) langToggle.hidden = true; // page sans traduction

  const placeThemeToggle = () => {
    if (mobileNav.matches && siteNavLinks) {
      themeItem.append(langToggle, themeToggle);
      siteNavLinks.append(themeItem);
    } else {
      themeItem.remove();
      navInner.append(langToggle, themeToggle);
    }
  };
  placeThemeToggle();
  mobileNav.addEventListener("change", placeThemeToggle);

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
    try { localStorage.setItem(THEME_KEY, nextTheme); } catch (error) { /* stockage indisponible */ }
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

// Coordonnées en bas de page selon la page : Photo & vidéo → Alexandre, Sites internet → Elisa,
// accueil, contenus réseaux et autres pages → les deux, avec le rôle de chacun.
const FOOTER_PEOPLE = {
  alex: {
    name: "Alexandre Palanca",
    role: "Photographe & vidéaste",
    email: "info@alexandrepalanca.fr",
    phone: "+33 6 79 53 82 80",
    tel: "+33679538280",
    place: "Sarlat-la-Canéda · Dordogne &amp; Périgord"
  },
  elisa: {
    name: "Elisa Martignac",
    role: "Webdesign & création de sites internet",
    roleLines: ["Webdesign &amp;", "création de sites internet"],
    email: "mtgcelisa@gmail.com",
    phone: "+33 6 65 47 73 51",
    tel: "+33665477351",
    place: ""
  }
};
const footerPage = (window.location.pathname.split("/").pop() || "index").replace(/\.html$/, "") || "index";
const footerWho = footerPage === "photo-video" ? ["alex"] : footerPage === "sites-internet" ? ["elisa"] : ["alex", "elisa"];
const footerSocials = `<nav class="site-footer-socials" aria-label="Réseaux sociaux">
          <a href="https://www.instagram.com/alexpalanca_/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor"/></svg></a>
          <a href="https://www.facebook.com/alexandre.palanca.7" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5l.5-3.5h-3V8.8a.3.3 0 0 1 .3-.3z"/></svg></a>
        </nav>`;
function footerContacts() {
  if (footerWho.length === 1) {
    const person = FOOTER_PEOPLE[footerWho[0]];
    // Une seule personne : même présentation qu'avant (e-mail en grand, téléphone, lieu)
    return `<p class="site-footer-person-name">${person.name} — <span>${person.role}</span></p>
        <a class="site-footer-email" href="mailto:${person.email}">${person.email}</a>
        <a class="site-footer-phone" href="tel:${person.tel}">${person.phone}</a>
        ${person.place ? `<p>${person.place}</p>` : ""}
        ${footerWho[0] === "alex" ? footerSocials : ""}`;
  }
  return `<div class="site-footer-people">${footerWho.map((key) => {
    const person = FOOTER_PEOPLE[key];
    return `<div class="site-footer-person">
          <p class="site-footer-person-name">${person.name}</p>
          <p class="site-footer-person-role">${(person.roleLines ?? [person.role]).join("<br>")}</p>
          <a class="site-footer-email" href="mailto:${person.email}">${person.email}</a>
          <a class="site-footer-phone" href="tel:${person.tel}">${person.phone}</a>
          ${person.place ? `<p class="site-footer-person-place">${person.place}</p>` : ""}
        </div>`;
  }).join("")}</div>
        ${footerSocials}`;
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
        ${footerContacts()}
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
            <span class="card-ink card-ink--logo" style="--ink: url(images/logo-accueil-carte.png)"><img src="images/logo-accueil-carte.png" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>
            <span class="card-ink card-ink--text" style="--ink: url(images/texte-accueil-carte.png)"><img src="images/texte-accueil-carte.png" alt="Alex &amp; Elisa" loading="lazy" decoding="async"></span>
          </div>
          <div class="site-footer-card-face site-footer-card-back">
            <img src="images/carte-verso.webp" loading="lazy" decoding="async" alt="Alexandre Palanca, photographe — 06 79 53 82 80 — instagram alexpalanca — alexpalanca@gmail.com">
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
    <div class="site-footer-ground" aria-hidden="true"></div>
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
  cardScript.src = "footer-card.js?v=6";
  document.body.append(cardScript);
}
