// Notifications push : préférences, abonnements, anti-doublon et calcul des messages à envoyer.
import { databaseRequest } from "./http.ts";
import * as center from "./admin-center.ts";
import { sendPush, vapidKeys, type PushMessage, type VapidKeys } from "./webpush.ts";

type Row = Record<string, any>;

// ---------------------------------------------------------------- préférences

export type Prefs = {
  enabled: boolean;
  categories: { planning: boolean; taches: boolean; espace: boolean; admin: boolean; systeme: boolean };
  planningLead: number;     // minutes avant un rendez-vous
  planningMorning: boolean; // récapitulatif à 8 h des rendez-vous du jour
  taskLead: number;         // heures avant l'échéance d'une tâche
  quiet: boolean;           // silence de 22 h à 7 h (sauf alertes système)
};

export const DEFAULT_PREFS: Prefs = {
  enabled: true,
  categories: { planning: true, taches: true, espace: true, admin: true, systeme: true },
  planningLead: 60,
  planningMorning: true,
  taskLead: 24,
  quiet: true
};
const LEADS = [15, 30, 60, 120, 1440];
const TASK_LEADS = [2, 6, 24, 48];

export function cleanPrefs(input: Row | null | undefined): Prefs {
  const p = input ?? {};
  const c = p.categories ?? {};
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    enabled: bool(p.enabled, DEFAULT_PREFS.enabled),
    categories: {
      planning: bool(c.planning, true), taches: bool(c.taches, true), espace: bool(c.espace, true),
      admin: bool(c.admin, true), systeme: bool(c.systeme, true)
    },
    planningLead: LEADS.includes(Number(p.planningLead)) ? Number(p.planningLead) : DEFAULT_PREFS.planningLead,
    planningMorning: bool(p.planningMorning, DEFAULT_PREFS.planningMorning),
    taskLead: TASK_LEADS.includes(Number(p.taskLead)) ? Number(p.taskLead) : DEFAULT_PREFS.taskLead,
    quiet: bool(p.quiet, DEFAULT_PREFS.quiet)
  };
}

export async function getPrefs(userId: string) {
  const rows = await databaseRequest(`push_preferences?select=prefs&user_id=eq.${userId}`) as Row[];
  return cleanPrefs(rows[0]?.prefs);
}

export async function savePrefs(userId: string, input: Row) {
  const prefs = cleanPrefs(input);
  await databaseRequest("push_preferences", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, prefs, updated_at: new Date().toISOString() })
  });
  return prefs;
}

// ---------------------------------------------------------------- abonnements

export async function subscribe(userId: string, input: Row, userAgent: string) {
  const endpoint = typeof input?.endpoint === "string" ? input.endpoint : "";
  const p256dh = typeof input?.keys?.p256dh === "string" ? input.keys.p256dh : "";
  const auth = typeof input?.keys?.auth === "string" ? input.keys.auth : "";
  if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) {
    throw new Error("Abonnement invalide.");
  }
  await databaseRequest("push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, endpoint, p256dh, auth, user_agent: userAgent.slice(0, 300), failures: 0, last_error: "" })
  });
  // Ce qui est déjà dans le centre de notifications n'est pas renvoyé : seules les nouveautés seront signalées.
  await seed(userId);
  return { subscribed: true };
}

export async function unsubscribe(userId: string, endpoint: unknown) {
  if (typeof endpoint !== "string" || !endpoint) throw new Error("Abonnement invalide.");
  await databaseRequest(`push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
  return { unsubscribed: true };
}

export async function devices(userId: string) {
  return await databaseRequest(`push_subscriptions?select=endpoint,user_agent,created_at,last_success_at,failures,last_error&user_id=eq.${userId}&order=created_at.asc`) as Row[];
}

async function seed(userId: string) {
  const { notifications } = await center.notifications();
  const keys = (notifications as Row[]).map((n) => `note:${n.key}`);
  await logKeys(userId, keys);
}

// Enregistre des clés ; ne renvoie que celles qui n'existaient pas (anti-doublon)
async function logKeys(userId: string, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const inserted = await databaseRequest("push_log?on_conflict=user_id,key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(keys.map((key) => ({ user_id: userId, key })))
  }) as Row[];
  return new Set((inserted ?? []).map((row) => String(row.key)));
}

// ---------------------------------------------------------------- envoi

export async function deliver(userId: string, message: PushMessage, keys?: VapidKeys, urgency: "high" | "normal" = "normal") {
  const vapid = keys ?? await vapidKeys();
  const subs = await databaseRequest(`push_subscriptions?select=id,endpoint,p256dh,auth,failures&user_id=eq.${userId}`) as Row[];
  const results = [];
  for (const sub of subs) {
    try {
      const r = await sendPush(sub as any, message, vapid, { urgency });
      if (r.ok) {
        await databaseRequest(`push_subscriptions?id=eq.${sub.id}`, { method: "PATCH", body: JSON.stringify({ last_success_at: new Date().toISOString(), failures: 0, last_error: "" }) });
      } else if (r.gone || sub.failures >= 9) {
        // Abonnement expiré ou refusé : retiré (l'application le recrée à sa prochaine ouverture)
        await databaseRequest(`push_subscriptions?id=eq.${sub.id}`, { method: "DELETE" });
      } else {
        await databaseRequest(`push_subscriptions?id=eq.${sub.id}`, { method: "PATCH", body: JSON.stringify({ failures: sub.failures + 1, last_error: `${r.status} ${r.error}`.slice(0, 300) }) });
      }
      results.push({ endpoint: new URL(sub.endpoint).host, status: r.status });
    } catch (error) {
      console.error("Push send failed", error);
      results.push({ endpoint: "?", status: 0 });
    }
  }
  return results;
}

// ---------------------------------------------------------------- calcul des messages

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
});
function parisParts(ms: number) {
  const p = Object.fromEntries(PARTS.formatToParts(ms).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), asUtc: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) };
}
// Date et heure de Paris -> instant UTC (heure d'été / d'hiver comprises)
export function parisToUtc(date: string, time: string) {
  const guess = Date.parse(`${date}T${time.slice(0, 5)}:00Z`);
  const offset = parisParts(guess).asUtc - guess;
  const first = guess - offset;
  return first - (parisParts(first).asUtc - first - offset);
}

type Candidate = { key: string; category: keyof Prefs["categories"]; message: PushMessage; urgent?: boolean };
const LEVEL_SENT = new Set(["urgent", "important", "normal"]);
const CATEGORY_OF: Record<string, keyof Prefs["categories"]> = { galerie: "espace", demande: "admin", devis: "admin", facture: "admin", rappel: "admin" };
const leadText = (minutes: number) => (minutes >= 1440 ? "demain" : minutes >= 60 ? `dans ${minutes / 60} h` : `dans ${minutes} min`);

export async function candidates(prefs: Prefs, now = Date.now()): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const paris = parisParts(now);
  const window = 15 * 60_000; // rattrapage si une exécution est manquée

  // Planning : rappel avant chaque rendez-vous confirmé (séances, options, devis acceptés)
  const to = new Date(now + 2 * 86_400_000).toISOString().slice(0, 10);
  const { entries } = await center.planning(paris.date, to) as { entries: Row[] };
  const reminders = entries.filter((e) => e.source === "manuel" || (e.source === "devis" && e.status === "confirmed"));
  for (const e of reminders) {
    if (!e.time) continue;
    const start = parisToUtc(e.date, String(e.time));
    const at = start - prefs.planningLead * 60_000;
    if (now >= at && now < at + window && now < start) {
      out.push({
        key: `planning:${e.source}:${e.id}:${e.date}T${String(e.time).slice(0, 5)}:${prefs.planningLead}`,
        category: "planning",
        urgent: prefs.planningLead <= 60,
        message: {
          title: `${e.title}`,
          body: `${leadText(prefs.planningLead)} — ${String(e.time).slice(0, 5).replace(":", " h ")}${e.location ? ` · ${e.location}` : ""}`,
          url: "/app/#planning", tag: `planning-${e.id}`
        }
      });
    }
  }
  if (prefs.planningMorning && paris.hour === 8 && paris.minute < 15) {
    const todays = reminders.filter((e) => e.date === paris.date);
    if (todays.length) {
      out.push({
        key: `matin:${paris.date}`, category: "planning",
        message: {
          title: `Aujourd'hui : ${todays.length} rendez-vous`,
          body: todays.slice(0, 4).map((e) => `${e.time ? String(e.time).slice(0, 5).replace(":", " h ") + " " : ""}${e.title}`).join(" · "),
          url: "/app/#planning", tag: `matin-${paris.date}`
        }
      });
    }
  }

  // Centre de notifications : nouveautés (administration, espace client) et échéances (tâches)
  const { notifications } = await center.notifications() as { notifications: Row[] };
  for (const n of notifications) {
    const category = CATEGORY_OF[n.category];
    if (category && LEVEL_SENT.has(n.level)) {
      out.push({ key: `note:${n.key}`, category, urgent: n.level === "urgent", message: { title: n.title, body: n.detail ?? "", url: "/app/#afaire", tag: n.key } });
    }
    if (n.deadline) {
      const left = Date.parse(n.deadline) - now;
      if (left > 0 && left <= prefs.taskLead * 3_600_000) {
        out.push({
          key: `echeance:${n.key}:${prefs.taskLead}`, category: "taches", urgent: left <= 6 * 3_600_000,
          message: { title: `Échéance : ${n.title}`, body: `Il reste ${Math.max(1, Math.round(left / 3_600_000))} h. ${n.detail ?? ""}`.trim(), url: "/app/#afaire", tag: `echeance-${n.key}` }
        });
      }
    }
  }

  // Système : tâche automatique en erreur (nettoyage, rappels de devis, envoi des notifications…)
  const since = new Date(now - 30 * 60_000).toISOString();
  const errors = await databaseRequest("rpc/recent_http_errors", { method: "POST", body: JSON.stringify({ p_since: since }) }).catch(() => []) as Row[];
  for (const err of errors ?? []) {
    out.push({
      key: `systeme:${err.id}`, category: "systeme", urgent: true,
      message: { title: "Problème technique à vérifier", body: `Une tâche automatique du site a échoué (${err.status_code ?? "sans réponse"}${err.error_msg ? ` : ${String(err.error_msg).slice(0, 80)}` : ""}).`, url: "/app/", tag: "systeme" }
    });
  }
  return out;
}

// Exécution planifiée : pour chaque administrateur abonné, envoie ce qui n'a pas encore été envoyé
export async function dispatch(now = Date.now()) {
  const subs = await databaseRequest("push_subscriptions?select=user_id") as Row[];
  const users = [...new Set(subs.map((s) => String(s.user_id)))];
  const report: Row[] = [];
  if (!users.length) return { users: 0, sent: 0, report };
  const keys = await vapidKeys();
  const quietHour = (() => { const h = parisParts(now).hour; return h >= 22 || h < 7; })();
  const cache = new Map<string, Candidate[]>();
  let sent = 0;
  for (const userId of users) {
    const prefs = await getPrefs(userId);
    if (!prefs.enabled) continue;
    const sig = `${prefs.planningLead}:${prefs.taskLead}:${prefs.planningMorning}`;
    if (!cache.has(sig)) cache.set(sig, await candidates(prefs, now));
    const list = cache.get(sig)!.filter((c) => prefs.categories[c.category])
      // Silence la nuit : seules les alertes système passent ; les autres restent à envoyer plus tard
      .filter((c) => !(prefs.quiet && quietHour && c.category !== "systeme"));
    const fresh = await logKeys(userId, list.map((c) => c.key));
    const toSend = list.filter((c) => fresh.has(c.key));
    // Au-delà de 3 nouveautés d'un coup : un seul résumé plutôt qu'une rafale
    const messages = toSend.length > 3
      ? [{ message: { title: `${toSend.length} nouvelles notifications`, body: toSend.slice(0, 3).map((c) => c.message.title).join(" · "), url: "/app/#afaire", tag: "resume" }, urgent: toSend.some((c) => c.urgent) }]
      : toSend;
    for (const m of messages) {
      const results = await deliver(userId, m.message, keys, m.urgent ? "high" : "normal");
      sent += results.filter((r) => r.status >= 200 && r.status < 300).length;
    }
    report.push({ user: userId.slice(0, 8), candidates: list.length, sent: messages.length });
  }
  // Journal anti-doublon : 60 jours suffisent
  await databaseRequest(`push_log?created_at=lt.${new Date(now - 60 * 86_400_000).toISOString()}`, { method: "DELETE" }).catch(() => {});
  return { users: users.length, sent, report };
}
