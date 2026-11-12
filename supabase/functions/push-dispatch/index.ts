// Envoi des notifications push, appelé toutes les 5 minutes par pg_cron (migration 202611120025).
// Protégé par le même secret du coffre que les autres tâches planifiées.
import { databaseRequest } from "../_shared/http.ts";
import { dispatch } from "../_shared/push-core.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "");
  const valid = token && await databaseRequest("rpc/cleanup_secret_valid", {
    method: "POST", body: JSON.stringify({ p_secret: token })
  }).catch(() => false) === true;
  if (!valid) return new Response(JSON.stringify({ message: "Non autorisé." }), { status: 401 });
  try {
    const result = await dispatch();
    console.log("Notifications push", JSON.stringify(result));
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Push dispatch failed", error);
    return new Response(JSON.stringify({ message: "Erreur d'envoi." }), { status: 500 });
  }
});
