// Aura lumineuse discrète qui suit la souris avec un léger retard.
(() => {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.appendChild(glow);

  const root = document.documentElement;
  const hero = document.querySelector(".intro-sequence");
  let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty;
  let active = false, running = false;

  const tick = () => {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    glow.style.transform = `translate3d(${x - 320}px, ${y - 320}px, 0)`;
    root.style.setProperty("--gx", `${x}px`);
    root.style.setProperty("--gy", `${y}px`);
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
      root.style.setProperty("--ga", show ? "1" : "0");
    }
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }, { passive: true });
  document.addEventListener("pointerleave", () => { glow.classList.remove("is-on"); root.style.setProperty("--ga", "0"); });
  document.addEventListener("pointerenter", () => { if (active) { glow.classList.add("is-on"); root.style.setProperty("--ga", "1"); } });
})();
