// Planning au format iCalendar (RFC 5545), pour un abonnement depuis un agenda.
type Entry = {
  date: string; time?: string; location?: string; title: string; note?: string;
  status: string; source: string; id: string; kind?: string;
};

const DURATION_MIN = 120; // le planning n'a pas d'heure de fin : 2 h par défaut

// Texte iCalendar : barres obliques, points-virgules, virgules et retours à la ligne échappés
function text(value: unknown) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lignes de 75 octets maximum (continuation par un espace), sans couper un caractère UTF-8
function fold(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length ? 74 : 75;
    if (enc.encode(current + char).length > limit) { parts.push(current); current = ""; }
    current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compact = (date: string) => date.replace(/-/g, "");
function nextDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function addMinutes(date: string, time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const day = total >= 1440 ? nextDay(date) : date;
  const t = total % 1440;
  return `${compact(day)}T${String(Math.floor(t / 60)).padStart(2, "0")}${String(t % 60).padStart(2, "0")}00`;
}
function utcStamp(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Fuseau Europe/Paris (heure d'été : dernier dimanche de mars ; heure d'hiver : dernier dimanche d'octobre)
const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Paris",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE"
];

const SOURCE = { devis: "Devis", demande: "Demande", manuel: "Planning" } as Record<string, string>;
const KIND = { seance: "Séance", option: "Option", autre: "Autre" } as Record<string, string>;

export function planningIcs(entries: Entry[], options: { name: string; appUrl: string; now?: number }) {
  const stamp = utcStamp(options.now ?? Date.now());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Alex & Elisa//Planning//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(options.name)}`, "X-WR-TIMEZONE:Europe/Paris",
    // Indication d'actualisation pour les agendas qui la prennent en compte
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M",
    ...VTIMEZONE
  ];
  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const time = /^\d{2}:\d{2}/.test(String(e.time ?? "")) ? String(e.time).slice(0, 5) : "";
    const tentative = e.status === "pending";
    const category = e.source === "manuel" ? KIND[e.kind ?? ""] ?? "Planning" : SOURCE[e.source] ?? "Planning";
    const description = [
      e.note,
      e.source === "devis" ? (e.status === "confirmed" ? "Devis accepté." : "Devis en attente de réponse.") : "",
      e.source === "demande" ? "Date souhaitée dans une demande reçue par le site." : "",
      e.source === "manuel" && e.kind === "option" ? "Option (non confirmée)." : "",
      `Ouvrir dans l'application : ${options.appUrl}`
    ].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.source}-${e.id}@alexandrepalanca.fr`,
      `DTSTAMP:${stamp}`,
      ...(time
        ? [`DTSTART;TZID=Europe/Paris:${compact(e.date)}T${time.replace(":", "")}00`, `DTEND;TZID=Europe/Paris:${addMinutes(e.date, time, DURATION_MIN)}`]
        : [`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`]),
      `SUMMARY:${text(tentative && e.source === "manuel" ? `${e.title} (option)` : e.title)}`,
      ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
      `DESCRIPTION:${text(description)}`,
      `CATEGORIES:${text(category)}`,
      `STATUS:${tentative ? "TENTATIVE" : "CONFIRMED"}`,
      `TRANSP:${tentative ? "TRANSPARENT" : "OPAQUE"}`,
      `URL:${options.appUrl}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
