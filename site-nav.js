const siteNav = document.getElementById("site-nav");
const siteNavToggle = document.getElementById("site-nav-toggle");
const siteNavLinks = document.getElementById("site-nav-links");

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
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div class="site-footer-brand">
        <a href="index.html#accueil">Alexandre Palanca</a>
        <p>Photographie &amp; vidéo · Sarlat-la-Canéda</p>
      </div>
      <div class="site-footer-column">
        <h2>Contact</h2>
        <a class="site-footer-icon-link" href="mailto:info@alexandrepalanca.fr"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/></svg><span>info@alexandrepalanca.fr</span></a>
        <a class="site-footer-icon-link" href="tel:+33679538280"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg><span>+33 6 79 53 82 80</span></a>
      </div>
      <div class="site-footer-column">
        <h2>Réseaux sociaux</h2>
        <div class="site-footer-socials">
          <a class="site-footer-icon-link" href="https://www.instagram.com/alexpalanca_/" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor"/></svg><span>Instagram</span></a>
          <a class="site-footer-icon-link" href="https://www.facebook.com/alexandre.palanca.7" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5l.5-3.5h-3V8.8a.3.3 0 0 1 .3-.3z"/></svg><span>Facebook</span></a>
        </div>
      </div>
      <div class="site-footer-column">
        <h2>Zone d’intervention</h2>
        <p>Sarlat-la-Canéda, Dordogne &amp; Périgord.</p>
        <p>Déplacements possibles selon les projets.</p>
      </div>
      <div class="site-footer-legal">
        <span>© ${new Date().getFullYear()} Alexandre Palanca</span>
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
