function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Le réglage serveur ${name} est manquant.`);
  return value;
}

import { databaseRequest } from "./http.ts";

// Vérifie le jeton Supabase Auth puis l'appartenance à la table gallery_admins.
export async function requireAdmin(request: Request) {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "");
  if (!token || token === request.headers.get("apikey")) {
    throw new Error("Session administrateur invalide.");
  }

  const response = await fetch(`${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: requiredEnv("SUPABASE_ANON_KEY"),
      Authorization: "Bearer " + token
    }
  });
  if (!response.ok) throw new Error("Session administrateur expirée.");
  const user = await response.json();
  const admins = await databaseRequest(
    `gallery_admins?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`
  ) as Array<{ user_id: string }>;
  if (!admins.length) throw new Error("Accès administrateur refusé.");
}
