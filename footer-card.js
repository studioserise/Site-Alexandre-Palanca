/* Carte de visite du pied de page :
   - clic glissé (ou flèches du clavier) pour la tourner ;
   - au repos, elle flotte doucement sur elle-même et ses reflets bougent avec elle.
   Tout est calculé image par image : l'angle choisi par l'utilisateur est lissé, puis on y ajoute
   le flottement, qui s'efface pendant qu'on manipule la carte. */
document.querySelectorAll(".site-footer-card").forEach((card) => {
  const inner = card.querySelector(".site-footer-card-inner");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Angle voulu (glisser, clavier) et angle affiché, qui le rejoint en douceur.
  const target = { rx: 0, ry: 0 };
  const shown = { rx: 0, ry: 0 };
  let floatAmount = reduceMotion ? 0 : 1; // 1 = flottement complet, 0 = immobile
  let dragging = null;
  let visible = false;
  let frame = 0;

  const apply = (time) => {
    const t = time / 1000;
    const swayY = Math.sin(t * 0.55) * 7 + Math.sin(t * 0.21) * 2.5; // rotation lente gauche / droite
    const swayX = Math.sin(t * 0.7 + 1.3) * 3.5;                     // bascule avant / arrière
    const swayZ = Math.sin(t * 0.37 + 0.6) * 0.8;                    // très légère rotation dans le plan
    const bob = Math.sin(t * 0.8) * 5;                               // monte et descend

    const rx = shown.rx + swayX * floatAmount;
    const ry = shown.ry + swayY * floatAmount;
    inner.style.transform =
      `translateY(${(bob * floatAmount).toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${(swayZ * floatAmount).toFixed(2)}deg)`;

    // Le reflet suit l'angle de la carte, avec un peu plus d'amplitude pendant le flottement.
    const light = 50 - 45 * Math.sin(((ry + 20) * Math.PI) / 180) + swayY * floatAmount * 1.6 - swayX * floatAmount;
    card.style.setProperty("--gx", `${light.toFixed(1)}%`);
    card.style.setProperty("--mx", `${(100 - light).toFixed(1)}%`);
  };

  const tick = (time) => {
    frame = 0;
    const ease = dragging ? 0.45 : 0.08;
    shown.rx += (target.rx - shown.rx) * ease;
    shown.ry += (target.ry - shown.ry) * ease;
    const wantedFloat = dragging || reduceMotion ? 0 : 1;
    floatAmount += (wantedFloat - floatAmount) * 0.04;
    apply(time);
    const settling = Math.abs(target.rx - shown.rx) + Math.abs(target.ry - shown.ry) > 0.05;
    if (visible && (!reduceMotion || settling)) frame = requestAnimationFrame(tick);
  };
  const run = () => { if (!frame) frame = requestAnimationFrame(tick); };

  // La CSS ne gère plus la transition : le script s'en charge.
  inner.style.transition = "none";

  const release = () => {
    if (!dragging) return;
    dragging = null;
    card.classList.remove("is-dragging");
    target.rx = 0;
    // Revient sur la face la plus proche (recto ou verso) : la carte ne reste jamais de profil.
    target.ry = Math.round(target.ry / 180) * 180;
    run();
  };
  card.addEventListener("dragstart", (event) => event.preventDefault());
  // Écran tactile : glisser le doigt servait aussi à faire défiler la page, la carte partait dans tous les sens.
  // Ici, un simple toucher la retourne (recto / verso) ; le doigt garde le défilement de la page.
  let tap = null;
  const hint = card.closest(".site-footer-card-wrap")?.querySelector(".site-footer-card-hint");
  if (window.matchMedia("(hover: none)").matches && hint) hint.textContent = "Touchez la carte pour la retourner";
  card.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    tap = { x: event.clientX, y: event.clientY, time: event.timeStamp };
  });
  card.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" || !tap) return;
    const moved = Math.hypot(event.clientX - tap.x, event.clientY - tap.y);
    const quick = event.timeStamp - tap.time < 600;
    tap = null;
    if (moved < 12 && quick) {
      target.rx = 0;
      target.ry = Math.round(target.ry / 180) * 180 + 180;
      run();
    }
  });
  card.addEventListener("pointercancel", () => { tap = null; });

  card.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return; // le toucher est géré juste au-dessus
    if (event.pointerType === "mouse" && event.button !== 0) return; // clic gauche seulement
    dragging = { x: event.clientX, y: event.clientY, ry: target.ry, rx: target.rx, id: event.pointerId };
    card.classList.add("is-dragging");
    try { card.setPointerCapture(event.pointerId); } catch (error) { /* sans capture, les filets ci-dessous suffisent */ }
    run();
  });
  card.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    // Filet de sécurité : si le bouton n'est plus enfoncé (relâché hors de la page, fenêtre changée…),
    // on lâche la carte au lieu de la laisser suivre la souris.
    if (event.pointerType === "mouse" && event.buttons === 0) { release(); return; }
    target.ry = dragging.ry + (event.clientX - dragging.x) * 0.6;
    target.rx = Math.max(-35, Math.min(35, dragging.rx - (event.clientY - dragging.y) * 0.3));
    run();
  });
  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", release);
  // La carte est aussi lâchée si la capture est perdue, si le clic est relâché ailleurs
  // ou si la fenêtre perd le focus.
  card.addEventListener("lostpointercapture", release);
  window.addEventListener("pointerup", release, true);
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });
  card.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      target.ry += event.key === "ArrowRight" ? 45 : -45;
      run();
    }
  });

  // Animation seulement quand la carte est à l'écran.
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) run();
  }).observe(card);

  apply(0);
});
