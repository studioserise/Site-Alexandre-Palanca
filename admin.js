import { getConfig } from "./galeries-config.js";
import { callGalleryFunction } from "./galeries-api.js";

const config = getConfig();
const accessTokenKey = "gallery-admin-access-token";
const loginForm = document.getElementById("admin-login-form");
const choice = document.getElementById("admin-choice");
const message = document.getElementById("admin-message");

function setMessage(text) {
  message.textContent = text;
}

async function signIn(email, password) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Le service sécurisé n’est pas encore configuré.");
  }
  const response = await fetch(
    `${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error(result.msg || result.message || "Connexion refusée.");
  }
  return result.access_token;
}

// Un simple appel à l'API d'administration confirme que le compte est bien administrateur.
async function verifyAdmin(token) {
  await callGalleryFunction("admin-api", { method: "GET", accessToken: token });
}

function showChoice() {
  loginForm.hidden = true;
  choice.hidden = false;
  setMessage("");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const token = await signIn(
      document.getElementById("admin-email").value.trim(),
      document.getElementById("admin-password").value
    );
    await verifyAdmin(token);
    window.sessionStorage.setItem(accessTokenKey, token);
    showChoice();
  } catch (error) {
    setMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("admin-logout").addEventListener("click", () => {
  window.sessionStorage.removeItem(accessTokenKey);
  choice.hidden = true;
  loginForm.hidden = false;
  setMessage("Vous êtes déconnecté.");
});

const existingToken = window.sessionStorage.getItem(accessTokenKey);
if (existingToken) {
  verifyAdmin(existingToken).then(showChoice).catch(() => {
    window.sessionStorage.removeItem(accessTokenKey);
  });
}
