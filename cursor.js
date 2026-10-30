const cursorRoot = document.documentElement;

function releaseCustomCursor() {
  cursorRoot.classList.remove("is-cursor-pressed");
}

document.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" || event.pointerType === "pen") {
    cursorRoot.classList.add("is-cursor-pressed");
  }
});

document.addEventListener("pointerup", releaseCustomCursor);
document.addEventListener("pointercancel", releaseCustomCursor);
window.addEventListener("blur", releaseCustomCursor);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseCustomCursor();
  }
});
