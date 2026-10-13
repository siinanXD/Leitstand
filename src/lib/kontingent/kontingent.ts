// Kontingent-Pausen (SIN-581). Rein: Reset-Zeit erkennen, Pausen prüfen, Wecker-Auswahl. Netz in scripts/kontingent/.
import { zeitInWorten } from "../zeit";

export const DIENSTE = ["claude", "openai", "anthropic_api", "higgsfield", "vercel_deploys", "github_api", "linear_api", "langfuse"] as const;
export type Dienst = (typeof DIENSTE)[number];

/** Standard, wenn weder Log noch Header eine Reset-Zeit nennen (Stunden). Dienste ohne Eintrag: 1 Stunde. */
export const STANDARD_STUNDEN: Partial<Record<Dienst, number>> = { claude: 5, vercel_deploys: 24, github_api: 1, linear_api: 1 };
const STANDARD_FALLBACK_STUNDEN = 1;

export type Pause = { id?: number; dienst: Dienst; bis: string; grund: string; repo: string | null; erstellt_at: string; geweckt_at: string | null };

const STUNDE = 3_600_000;
export const istDienst = (s: unknown): s is Dienst => typeof s === "string" && (DIENSTE as readonly string[]).includes(s);

/** Trifft der Text eine Limit-Meldung? (Claude: „usage limit reached“, „5-hour limit reached ∙ resets 7pm“, API: rate limit) */
export const istLimitMeldung = (text: string) => /(usage|rate|\d+-hour|weekly|monthly)\s+limit\s+(reached|exceeded)|quota exceeded|too many requests/i.test(text);

/** Versatz der Zeitzone gegenüber UTC in ms an einem Zeitpunkt. Unbekannte Zone: null. */
function versatz(zone: string, am: Date): number | null {
  try {
    const teile = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(am);
    const p = Object.fromEntries(teile.map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(am.getTime() / 1000) * 1000;
  } catch {
    return null;
  }
}

/** „resets 7pm“, „resets 7:30pm (Europe/Berlin)“: nächster solcher Zeitpunkt nach `jetzt`. Ohne Zone gilt UTC. */
export function resetAusLog(text: string, jetzt: Date): Date | null {
  const m = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b(?:\s*\(([A-Za-z_]+\/[A-Za-z_]+|UTC)\))?/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  const min = Number(m[2] ?? 0);
  const zone = m[4] ?? "UTC";
  const v0 = versatz(zone, jetzt);
  if (v0 === null) return null;
  // Lokaler Kalendertag von `jetzt` in der Zone, dann Uhrzeit setzen; liegt sie nicht in der Zukunft, einen Tag später.
  const lokal = new Date(jetzt.getTime() + v0);
  const kandidat = (tage: number) => {
    const roh = Date.UTC(lokal.getUTCFullYear(), lokal.getUTCMonth(), lokal.getUTCDate() + tage, h, min);
    const v = versatz(zone, new Date(roh - v0)) ?? v0; // Sommerzeitwechsel zwischen jetzt und Ziel
    return new Date(roh - v);
  };
  const heute = kandidat(0);
  return heute.getTime() > jetzt.getTime() ? heute : kandidat(1);
}

type Header = { get(name: string): string | null };

/** `retry-after` (Sekunden oder Datum) oder `x-ratelimit-reset` (Epoch-Sekunden, wie GitHub). */
export function resetAusHeadern(h: Header, jetzt: Date): Date | null {
  const retry = h.get("retry-after");
  if (retry) {
    const s = Number(retry);
    const t = Number.isFinite(s) ? jetzt.getTime() + s * 1000 : Date.parse(retry);
    if (Number.isFinite(t)) return new Date(t);
  }
  const reset = Number(h.get("x-ratelimit-reset"));
  return Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null;
}

/** Reset-Zeit: Log, dann Header, sonst Standard des Dienstes. Liegt die Zeit nicht in der Zukunft, gilt der Standard. */
export function resetZeit(dienst: Dienst, quellen: { log?: string; header?: Header }, jetzt: Date): Date {
  const gefunden = (quellen.log ? resetAusLog(quellen.log, jetzt) : null) ?? (quellen.header ? resetAusHeadern(quellen.header, jetzt) : null);
  if (gefunden && gefunden.getTime() > jetzt.getTime()) return gefunden;
  return new Date(jetzt.getTime() + (STANDARD_STUNDEN[dienst] ?? STANDARD_FALLBACK_STUNDEN) * STUNDE);
}

/** Läuft für den Dienst gerade eine Pause? Gibt die späteste zurück. */
export function aktivePause(pausen: Pause[], dienst: Dienst, jetzt: Date): Pause | null {
  let r: Pause | null = null;
  for (const p of pausen) {
    if (p.dienst !== dienst || p.geweckt_at || Date.parse(p.bis) <= jetzt.getTime()) continue;
    if (!r || Date.parse(p.bis) > Date.parse(r.bis)) r = p;
  }
  return r;
}

/** Wecker-Auswahl: abgelaufen und noch nicht geweckt. */
export const abgelaufen = (pausen: Pause[], jetzt: Date) => pausen.filter((p) => !p.geweckt_at && Date.parse(p.bis) <= jetzt.getTime());

/** Workflows, die nach Ablauf anzustoßen sind. `vercel_deploys` braucht den Redeploy statt eines Workflows (im Skript). */
const LERNAPP = { repo: "siinanXD/Content-Agent-Lernapp", workflow: "dispatch.yml" };
const LEITSTAND = { repo: "siinanXD/Leitstand", workflow: "dispatch.yml" };
export const WECK_ZIELE: Partial<Record<Dienst, { repo: string; workflow: string }[]>> = {
  claude: [LERNAPP, LEITSTAND],
  openai: [LERNAPP],
  anthropic_api: [LERNAPP],
  github_api: [LERNAPP, LEITSTAND],
  linear_api: [LERNAPP, LEITSTAND],
};

const NAMEN: Record<Dienst, string> = {
  claude: "Claude-Kontingent",
  openai: "OpenAI-Kontingent",
  anthropic_api: "Anthropic-Kontingent",
  higgsfield: "Higgsfield-Kontingent",
  vercel_deploys: "Deploy-Kontingent bei Vercel",
  github_api: "GitHub-Kontingent",
  linear_api: "Linear-Kontingent",
  langfuse: "Langfuse-Kontingent",
};

/** Uhrzeit in Berlin: „19 Uhr“ oder „19:30 Uhr“. */
function uhr(d: Date): string {
  const t = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${t.replace(/^0/, "").replace(/:00$/, "")} Uhr`;
}

/** „Pause: Claude-Kontingent leer, geht heute um 19 Uhr weiter.“ (SIN-578: Zeit in Worten, keine Kennungen) */
export function pauseSatz(p: Pick<Pause, "dienst" | "bis">, jetzt: Date): string {
  const wann = zeitInWorten(p.bis, jetzt);
  const tag = wann === "heute" || wann === "morgen" ? wann : "später";
  return `Pause: ${NAMEN[p.dienst]} leer, geht ${tag} um ${uhr(new Date(p.bis))} weiter.`;
}
