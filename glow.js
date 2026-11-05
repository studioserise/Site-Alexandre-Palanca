// Aura lumineuse discrète qui suit la souris avec un léger retard.
// Elle est posée par-dessus toute la page (voir .cursor-glow dans redesign.css) :
// elle passe sur tous les fonds, y compris l'accueil, sans être coupée.
(() => {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.appendChild(glow);

  let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty;
  let running = false;

  const tick = () => {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    glow.style.transform = `translate3d(${x - 320}px, ${y - 320}px, 0)`;
    if (Math.abs(tx - x) + Math.abs(ty - y) > 0.5) requestAnimationFrame(tick);
    else running = false;
  };

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    tx = event.clientX;
    ty = event.clientY;
    glow.classList.add("is-on");
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }, { passive: true });
  document.addEventListener("pointerleave", () => glow.classList.remove("is-on"));
})();
