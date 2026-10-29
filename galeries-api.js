import { getConfig } from "./galeries-config.js";
import { createZipBlob } from "./gallery-zip.js?v=free-gallery-zip";

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

export async function downloadGalleryPhoto(photoId, orderSessionId) {
  const { blob, filename } = await fetchGalleryOriginal(photoId, orderSessionId);
  triggerDownload(blob, filename);
}

export async function downloadGalleryPhotosZip(
  photoIds,
  galleryName,
  onProgress = () => {},
  orderSessionId
) {
  if (!photoIds.length) {
    throw new Error("Sélectionnez au moins une photo à télécharger.");
  }
  if (photoIds.length > 0xffff) {
    throw new Error("La sélection est trop volumineuse pour créer une archive ZIP.");
  }

  const files = [];
  for (let index = 0; index < photoIds.length; index += 1) {
    onProgress(index + 1, photoIds.length);
    const { blob, filename } = await fetchGalleryOriginal(photoIds[index], orderSessionId);
    files.push({ name: filename, blob });
  }
  onProgress("zip", photoIds.length);

  const archive = await createZipBlob(files);
  const safeName = galleryName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "galerie";
  triggerDownload(archive, `${safeName}-photos.zip`);
}

async function fetchGalleryOriginal(photoId, orderSessionId) {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  const sessionToken = window.sessionStorage.getItem("gallery-session-token");
  if (!supabaseUrl || !supabaseAnonKey || (!sessionToken && !orderSessionId)) {
    throw new Error("La session de galerie a expiré. Saisissez de nouveau votre code d’accès.");
  }
  const token = sessionToken ?? supabaseAnonKey;
  const url = new URL(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/gallery-download`
  );
  url.searchParams.set("photo_id", photoId);
  if (orderSessionId) url.searchParams.set("session_id", orderSessionId);

  const response = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Le téléchargement de la photo a échoué.");
  }

  const filename = response.headers.get("Content-Disposition")
    ?.match(/filename="([^"]+)"/i)?.[1];
  const blob = await response.blob();
  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  }[blob.type];
  return {
    blob,
    filename: filename || `photo-${photoId}.${extension || "jpg"}`
  };
}

function triggerDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
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
