import { getConfig } from "./galeries-config.js";

export function isBackendConfigured() {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function callGalleryFunction(name, {
  method = "POST",
  body,
  accessToken
} = {}) {
  const { supabaseUrl, supabaseAnonKey } = getConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Le service de galeries n’est pas encore configuré.");
  }

  const sessionToken = accessToken ??
    window.sessionStorage.getItem("gallery-session-token");
  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${sessionToken || supabaseAnonKey}`
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`,
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }
  );
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Une erreur est survenue.");
  }

  return result;
}

export async function fetchGalleryPreview(photoId) {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  const token = window.sessionStorage.getItem("gallery-session-token");
  if (!supabaseUrl || !supabaseAnonKey || !token) {
    throw new Error("La session de galerie a expiré.");
  }
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/gallery-preview?photo_id=${encodeURIComponent(photoId)}`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`
      },
      cache: "no-store"
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "L’aperçu n’a pas pu être chargé.");
  }
  return URL.createObjectURL(await response.blob());
}

export async function uploadSignedObject(bucket, path, token, file) {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = new URL(
    `/storage/v1/object/upload/sign/${bucket}/${encodedPath}`,
    supabaseUrl
  );
  url.searchParams.set("token", token);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false"
    },
    body: file
  });

  if (!response.ok) {
    throw new Error("L’envoi du fichier vers le stockage privé a échoué.");
  }
}
