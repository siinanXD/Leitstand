// Reine Ableitungen für die Übersicht. Eingabe sind Zeilen aus loop_events und loop_snapshot (SIN-303); nichts wird erfunden.

export type LoopEvent = { id: string; created_at: string; project: string | null; step: string | null; status: string | null; issue: string | null; pr: number | null };
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
};

export type Quelle = { events: LoopEvent[]; snapshot: SnapshotRow[] };
export type Quota = { name: string; used: number; limit: number; schaetzung: boolean };

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Liste aus Array oder kommagetrenntem Text. */
const liste = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).flatMap((x) => (typeof x === "string" && x.trim() !== "" ? [x.trim()] : []));

export function parseEvents(raw: unknown): LoopEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = obj(r);
    const created = o && str(o.created_at);
    if (!o || !created || Number.isNaN(Date.parse(created))) return [];
    return [{ id: String(o.id ?? created), created_at: created, project: str(o.project), step: str(o.step), status: str(o.status), issue: str(o.issue), pr: num(o.pr) }];
  });
}

export function parseSnapshot(raw: unknown): SnapshotRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = obj(r);
    const project = o && str(o.project);
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
export const brauchtDich = (s: SnapshotRow[]) => s.filter((r) => r.status && WARTET.has(r.status));

export function kontingente(snapshot: SnapshotRow[]): Quota[] {
  return snapshot.flatMap((s) =>
    s.quota_name && s.quota_used !== null && s.quota_limit !== null && s.quota_limit > 0
      ? [{ name: s.quota_name, used: s.quota_used, limit: s.quota_limit, schaetzung: /claude/i.test(s.quota_name) }]
      : [],
  );
}

/** Ein Satz aus echten Zahlen; ohne Daten null. Belege = jüngste Ereignisse. */
export function heuteSatz(q: Quelle, jetzt: Date): { satz: string; belege: LoopEvent[] } | null {
  const ev = letzte24h(q.events, jetzt);
  if (ev.length === 0 && q.snapshot.length === 0) return null;
  const projekte = new Set(q.snapshot.map((s) => s.project)).size;
  const teile = [`${ev.length} ${ev.length === 1 ? "Ereignis" : "Ereignisse"} in 24 h`];
  if (projekte > 0) teile.push(`${projekte} ${projekte === 1 ? "Projekt" : "Projekte"} im Stand`);
  const wartet = brauchtDich(q.snapshot).length;
  if (wartet > 0) teile.push(`${wartet} warten auf dich`);
  const belege = [...ev].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 3);
  return { satz: `${teile.join(", ")}.`, belege };
}
