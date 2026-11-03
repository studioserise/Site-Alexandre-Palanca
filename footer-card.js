document.querySelectorAll(".site-footer-card").forEach((card) => {
  let ry = 0;
  let rx = 0;
  let dragging = null;
  const apply = () => {
    card.style.setProperty("--card-rx", `${rx}deg`);
    card.style.setProperty("--card-ry", `${ry}deg`);
    const inner = card.querySelector(".site-footer-card-inner");
    inner.style.setProperty("--card-rx", `${rx}deg`);
    inner.style.setProperty("--card-ry", `${ry}deg`);
    const light = 50 - 45 * Math.sin(((ry + 20) * Math.PI) / 180);
    card.style.setProperty("--gx", `${light.toFixed(1)}%`);
    card.style.setProperty("--mx", `${(100 - light).toFixed(1)}%`);
  };
  card.addEventListener("dragstart", (event) => event.preventDefault());
  card.addEventListener("pointerdown", (event) => {
    dragging = { x: event.clientX, y: event.clientY, ry, rx };
    card.classList.add("is-dragging");
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    ry = dragging.ry + (event.clientX - dragging.x) * 0.6;
    rx = Math.max(-35, Math.min(35, dragging.rx - (event.clientY - dragging.y) * 0.3));
    apply();
  });
  const release = () => {
    if (!dragging) return;
    dragging = null;
    card.classList.remove("is-dragging");
    rx = 0;
    apply();
  };
  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", release);
  card.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      ry += event.key === "ArrowRight" ? 45 : -45;
      apply();
    }
  });
  apply();
});
