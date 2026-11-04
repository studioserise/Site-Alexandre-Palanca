// Aura lumineuse discrète qui suit la souris avec un léger retard.
(() => {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.appendChild(glow);

  const hero = document.querySelector(".intro-sequence");
  // Seule la section qui suit l'accueil dessine l'aura dans son propre fond : les variables
  // ne sont posées que sur elle (sur <html>, elles forçaient le navigateur à recalculer
  // toute la page à chaque mouvement de souris).
  const auraSection = hero && hero.nextElementSibling;
  const setAura = (name, value) => { if (auraSection) auraSection.style.setProperty(name, value); };
  const placeAura = () => {
    if (!auraSection) return;
    const box = auraSection.getBoundingClientRect();
    setAura("--gx", `${x - box.left}px`);
    setAura("--gy", `${y - box.top}px`);
  };
  let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty;
  let active = false, running = false;

  const tick = () => {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    glow.style.transform = `translate3d(${x - 320}px, ${y - 320}px, 0)`;
    placeAura();
    if (Math.abs(tx - x) + Math.abs(ty - y) > 0.5) requestAnimationFrame(tick);
    else running = false;
  };

  window.addEventListener("pointermove", (event) => {
    tx = event.clientX;
    ty = event.clientY;
    const rect = hero && hero.getBoundingClientRect();
    const next = hero && hero.nextElementSibling;
    const heroBottom = rect && next ? Math.min(rect.bottom, next.getBoundingClientRect().top + innerHeight * 0.2) : (rect ? rect.bottom : 0);
    const overHero = rect && ty > rect.top && ty < heroBottom;
    const show = !overHero;
    if (show !== active) {
      active = show;
      glow.classList.toggle("is-on", show);
      setAura("--ga", show ? "1" : "0");
    }
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }, { passive: true });
  document.addEventListener("pointerleave", () => { glow.classList.remove("is-on"); setAura("--ga", "0"); });
  document.addEventListener("pointerenter", () => { if (active) { glow.classList.add("is-on"); setAura("--ga", "1"); } });
  // L'aura reste sous la souris quand la page défile.
  if (auraSection) window.addEventListener("scroll", () => { if (active) placeAura(); }, { passive: true });
})();
