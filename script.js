
/* =========================
   0. ANIMATION DE LA SIGNATURE
========================= */

const logoPosition = document.querySelector(".logo-position");
const signature = document.querySelector(".hero-signature");
const logoImage = document.querySelector(".hero-logo");

function lancerSignature() {
  // Attend la fin de la rotation
  logoImage.addEventListener("animationend", function rotationTerminee(event) {
    if (event.animationName !== "rotation-logo") return;

    logoImage.removeEventListener("animationend", rotationTerminee);

    // Le logo se déplace et rétrécit
    logoPosition.classList.add("deplacer");

    // Le texte apparaît légèrement après
    setTimeout(() => {
      signature.classList.add("reveler");
    }, 250);
  });
}

if (logoImage.complete && logoImage.naturalWidth > 0) {
  lancerSignature();
} else {
  logoImage.addEventListener("load", lancerSignature, { once: true });
}
