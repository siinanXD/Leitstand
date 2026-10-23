import type { Aufgabe } from "./aufgaben";
import { parseGuthaben, parseNichtMessbar, type Guthaben } from "./kosten/guthaben";
import { parsePlan, type Plan } from "./vorarbeiter/vorarbeiter";
import { parseOffenePrs, type OffenerPr } from "./wartende-prs";

// Reine Ableitungen für die Übersicht. Eingabe sind Zeilen aus loop_events und loop_snapshot (SIN-303); nichts wird erfunden.

export type LoopEvent = { id: string; created_at: string; project: string | null; step: string | null; status: string | null; issue: string | null;
  pr: number | null;
  /** Optional (SIN-481): Agent-Rolle und Kosten in US-Dollar. Fehlen die Spalten, bleibt die Agenten-Ansicht bei „Keine Daten“. */
  agent: string | null;
  cost: number | null;
};
export type SnapshotRow = {
  project: string;
  stage: string | null;
  status: string | null;
  title: string | null;
  updated_at: string | null;
  quota_name: string | null;
  quota_used: number | null;
  quota_limit: number | null;
  /** Optional: Linear-Kennung und Blocker (SIN-305). Fehlen die Spalten, bleibt die Abhängigkeits-Ansicht leer. */
  issue: string | null;
  blocked_by: string[];
  /** Kontingente aus der Spalte `quotas` (SIN-499). */
  quotas: Quota[];
  /** Optional (SIN-509): Labels (`sinan`, `risk:high`, `freigegeben`), geschätzte Minuten und PR-Nummer für „Braucht dich“. */
  labels: string[];
  minutes: number | null;
  pr: number | null;
  /** Optional (SIN-517): offene PRs des Projekts für „warten auf dich“. */
  open_prs: OffenerPr[];
  /** Optional (SIN-526): Fortschritt „x von y fertig“ (Meilenstein „v1 Grundgerüst“) und neue Ideen („v2 Ideen“). */
  progress?: Teilstand | null;
  /** Optional (SIN-555): Guthaben je Dienst aus `loop_snapshot.guthaben`. */
  guthaben?: Guthaben[];
  /** Optional (SIN-1047): Dienste ohne Messung, mit Grund (z. B. Admin-Key fehlt). */
  nichtMessbar?: { dienst: string; grund: string }[];
  /** Optional (SIN-572): Schlange als Zusammenfassung, wo kein Issue pro Zeile steht (Leitstand). */
  queue?: Queue | null;
  /** Optional (SIN-553): Plan des Vorarbeiters aus `loop_snapshot.plan`. */
  plan?: Plan | null;
  /** Optional (SIN-942): Wochenmessung je Rolle und Modell aus `loop_snapshot.modelle`, ungeprüft; lesen mit leseMessungen. */
  modelle?: unknown;
};
export type Queue = { todo: number; startable: number; in_progress: number };
export type Teilstand = { fertig: number; gesamt: number; neueIdeen: number };

export type Quelle = { events: LoopEvent[]; snapshot: SnapshotRow[];
  /** Linear-Aufgaben mit Titel und Stand (leitstand_aufgaben); fehlt die Tabelle, bleibt es leer. */
  aufgaben?: Aufgabe[] };
/** `quelle`: woher der Wert stammt (SIN-1047); `key`: stabile Kennung für Proben. */
export type Quota = { name: string; used: number; limit: number; schaetzung: boolean; key?: string; quelle?: "team" | "api" | "gerechnet" | "schaetzung" };

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Liste aus Array oder kommagetrenntem Text. */
const liste = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).flatMap((x) => (typeof x === "string" && x.trim() !== "" ? [x.trim()] : []));

/** Projektnamen in loop_events, die vom Leitstand-Kürzel abweichen (SIN-482). Schlüssel kleingeschrieben. */
const PROJEKT_ALIAS: Record<string, string> = { "content-agent-lernapp": "lernapp" };
/** Schrittnamen der Loops → Stufe im Leitstand (SIN-482). Schlüssel großgeschrieben. */
const STUFE_ALIAS: Record<string, string> = { PLANNER: "PLAN", DISPATCH: "QUEUE", WORKER: "WORK", "PR-GATE": "GATE" };
/** Ereignisse des Betriebs: werden gezeigt, sind aber keine Stufe. */
export const BETRIEB = ["STATUS", "DIGEST", "PAUSE", "IDEE"];

export const projektKuerzel = (name: string | null): string | null => (name ? (PROJEKT_ALIAS[name.toLowerCase()] ?? name) : null);
export const stufeKuerzel = (name: string | null): string | null => (name ? (STUFE_ALIAS[name.toUpperCase()] ?? name) : null);

/** `quotas` als Liste [{name, used, limit}], Objekt {name: {used, limit}} oder {name: [used, limit]}; Text wird als JSON gelesen. */
export function parseQuotas(raw: unknown): Quota[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const o = obj(v);
  const eintraege: [string | null, unknown][] = Array.isArray(v) ? v.map((x) => [str(obj(x)?.name), x]) : o ? Object.entries(o) : [];
  return eintraege.flatMap(([name, x]) => {
    const e = obj(x);
    const used = Array.isArray(x) ? num(x[0]) : num(e?.used ?? e?.value);
    const limit = Array.isArray(x) ? num(x[1]) : num(e?.limit ?? e?.max);
    const quelle = (["team", "api", "gerechnet", "schaetzung"] as const).find((q) => q === e?.quelle);
    const key = str(e?.key);
    return name && used !== null && limit !== null && limit > 0 ? [{ name, used, limit, schaetzung: /claude/i.test(name) || quelle === "schaetzung", ...(key ? { key } : {}), ...(quelle ? { quelle } : {}) }] : [];
  });
}

/** Spalte `progress`: `{done, total, ideas}`, auch als JSON-Text. Unlesbar oder ohne Gesamtzahl: null (nichts raten). */
export function parseFortschritt(raw: unknown): Teilstand | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const o = obj(v);
  const zahl = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
  const fertig = zahl(o?.done ?? o?.fertig);
  const gesamt = zahl(o?.total ?? o?.gesamt);
  if (fertig === null || gesamt === null || gesamt === 0 || fertig > gesamt) return null;
  return { fertig, gesamt, neueIdeen: zahl(o?.ideas ?? o?.ideen) ?? 0 };
}

/** Spalte `queue`: `{todo, startable, in_progress}`, auch als JSON-Text. Unlesbar: null. */
export function parseQueue(raw: unknown): Queue | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const o = obj(v);
  const zahl = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
  const todo = zahl(o?.todo);
  const startable = zahl(o?.startable);
  const in_progress = zahl(o?.in_progress);
  return todo === null || startable === null || in_progress === null ? null : { todo, startable, in_progress };
}

export function parseEvents(raw: unknown): LoopEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = obj(r);
    const created = o && str(o.created_at);
    if (!o || !created || Number.isNaN(Date.parse(created))) return [];
    return [{ id: String(o.id ?? created), created_at: created, project: projektKuerzel(str(o.project)), step: stufeKuerzel(str(o.step)), status: str(o.status), issue: str(o.issue), pr: num(o.pr), agent: str(o.agent)?.toLowerCase() ?? null, cost: num(o.cost_usd) }];
  });
}

export function parseSnapshot(raw: unknown): SnapshotRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = obj(r);
    const project = o && projektKuerzel(str(o.project));
    if (!o || !project) return [];
    return [
      {
        project,
        stage: str(o.stage),
        status: str(o.status),
        title: str(o.title),
        updated_at: str(o.updated_at),
        quota_name: str(o.quota_name),
        quota_used: num(o.quota_used),
        quota_limit: num(o.quota_limit),
        issue: str(o.issue),
        blocked_by: liste(o.blocked_by),
        quotas: parseQuotas(o.quotas),
        labels: liste(o.labels).map((l) => l.toLowerCase()),
        minutes: num(o.minutes ?? o.estimate_min),
        pr: num(o.pr),
        open_prs: parseOffenePrs(o.open_prs),
        // Der Status-Lauf der Lern-App schreibt fertig_v1/gesamt_v1/ideen_offen statt progress (Befund 13.10.: überall „Keine Daten“).
        progress: parseFortschritt(o.progress) ?? parseFortschritt({ done: num(o.fertig_v1), total: num(o.gesamt_v1), ideas: num(o.ideen_offen) ?? 0 }),
        queue: parseQueue(o.queue),
        guthaben: parseGuthaben(o.guthaben),
        nichtMessbar: parseNichtMessbar(o.guthaben),
        plan: parsePlan(o.plan),
        modelle: o.modelle ?? null,
      },
    ];
  });
}

export const STUNDEN = 24;

export function letzte24h(events: LoopEvent[], jetzt: Date): LoopEvent[] {
  const ab = jetzt.getTime() - STUNDEN * 3_600_000;
  return events.filter((e) => Date.parse(e.created_at) >= ab && Date.parse(e.created_at) <= jetzt.getTime());
}

/** 24 Eimer, Index 0 = ältester, Index 23 = aktuelle Stunde. */
export function aktivitaet(events: LoopEvent[], jetzt: Date): number[] {
  const eimer = new Array<number>(STUNDEN).fill(0);
  for (const e of letzte24h(events, jetzt)) {
    const alter = Math.floor((jetzt.getTime() - Date.parse(e.created_at)) / 3_600_000);
    eimer[STUNDEN - 1 - Math.min(alter, STUNDEN - 1)] += 1;
  }
  return eimer;
}

export function pipeline(snapshot: SnapshotRow[]): { stage: string; anzahl: number }[] {
  const zaehler = new Map<string, number>();
  for (const s of snapshot) if (s.stage) zaehler.set(s.stage, (zaehler.get(s.stage) ?? 0) + 1);
  return [...zaehler].map(([stage, anzahl]) => ({ stage, anzahl }));
}

export const STUFEN = ["PLAN", "QUEUE", "WORK", "PR", "GATE", "MERGE", "DEPLOY"];

/** Pipeline-Schiene: feste Stufen, Zahlen nur aus dem Snapshot; ohne Stufen-Daten leer. */
export function schiene(snapshot: SnapshotRow[]): { stage: string; anzahl: number }[] {
  const zaehler = new Map<string, number>();
  for (const { stage, anzahl } of pipeline(snapshot)) zaehler.set(stage.toUpperCase(), (zaehler.get(stage.toUpperCase()) ?? 0) + anzahl);
  if (zaehler.size === 0) return [];
  const fest = STUFEN.map((stage) => ({ stage, anzahl: zaehler.get(stage) ?? 0 }));
  const weitere = [...zaehler].filter(([stage]) => !STUFEN.includes(stage)).map(([stage, anzahl]) => ({ stage, anzahl }));
  return [...fest, ...weitere];
}

const LAEUFT =new Set(["running", "in_progress", "active"]);
const WARTET = new Set(["waiting", "blocked", "needs_review", "needs_human"]);

export const inArbeit = (s: SnapshotRow[]) => s.filter((r) => r.status && LAEUFT.has(r.status));

const START = new Set([...LAEUFT, "start", "started"]);
const schluessel = (projekt: string, issue: string) => `${projekt}|${issue}`;

/** Fallback (SIN-499): Issues, deren jüngstes Ereignis ein begonnener WORK-Schritt ist, ohne Abschluss danach. */
export function inArbeitAusEreignissen(events: LoopEvent[]): SnapshotRow[] {
  const letzte = new Map<string, LoopEvent>();
  for (const e of events) {
    if (!e.project || !e.issue) continue;
    const k = schluessel(e.project, e.issue);
    const alt = letzte.get(k);
    if (!alt || Date.parse(e.created_at) > Date.parse(alt.created_at)) letzte.set(k, e);
  }
  return [...letzte.values()]
    .filter((e) => e.step?.toUpperCase() === "WORK" && e.status && START.has(e.status.toLowerCase()))
    .map((e) => ({ project: e.project!, stage: e.step, status: "running", title: e.issue, updated_at: e.created_at, quota_name: null, quota_used: null, quota_limit: null, issue: e.issue, blocked_by: [], quotas: [], labels: [], minutes: null, pr: null, open_prs: [] }));
}

/** Snapshot zuerst; Issues ohne Snapshot-Zeile kommen aus den Ereignissen der 24 h. */
export function laufend(q: Quelle, jetzt: Date): SnapshotRow[] {
  const bekannt = new Set(q.snapshot.flatMap((s) => (s.issue ? [schluessel(s.project, s.issue)] : [])));
  const ausEreignissen = inArbeitAusEreignissen(letzte24h(q.events, jetzt)).filter((r) => !bekannt.has(schluessel(r.project, r.issue ?? "")));
  return [...inArbeit(q.snapshot), ...ausEreignissen];
}

/** Projekte aus Snapshot und allen Ereignissen der 24 h (SIN-499). */
export const projekteImStand = (q: Quelle, jetzt: Date): string[] => [...new Set([...q.snapshot.map((s) => s.project), ...letzte24h(q.events, jetzt).flatMap((e) => (e.project ? [e.project] : []))])];
export const brauchtDich = (s: SnapshotRow[]) => s.filter((r) => r.status && WARTET.has(r.status));

export function kontingente(snapshot: SnapshotRow[]): Quota[] {
  return snapshot.flatMap((s) => [
    ...s.quotas,
    ...(s.quota_name && s.quota_used !== null && s.quota_limit !== null && s.quota_limit > 0
      ? [{ name: s.quota_name, used: s.quota_used, limit: s.quota_limit, schaetzung: /claude/i.test(s.quota_name) }]
      : []),
  ]);
}

/** Ein Satz aus echten Zahlen; ohne Daten null. Belege = jüngste Ereignisse. */
export function heuteSatz(q: Quelle, jetzt: Date): { satz: string; belege: LoopEvent[] } | null {
  const ev = letzte24h(q.events, jetzt);
  if (ev.length === 0 && q.snapshot.length === 0) return null;
  const projekte = projekteImStand(q, jetzt).length;
  const teile = [`${ev.length} ${ev.length === 1 ? "Ereignis" : "Ereignisse"} in 24 h`];
  if (projekte > 0) teile.push(`${projekte} ${projekte === 1 ? "Projekt" : "Projekte"} im Stand`);
  const wartet = brauchtDich(q.snapshot).length;
  if (wartet > 0) teile.push(`${wartet} warten auf dich`);
  const belege = [...ev].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 3);
  return { satz: `${teile.join(", ")}.`, belege };
}
