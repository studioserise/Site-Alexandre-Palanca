const siteNav = document.getElementById("site-nav");
const siteNavToggle = document.getElementById("site-nav-toggle");
const siteNavLinks = document.getElementById("site-nav-links");

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
