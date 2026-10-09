// Reine Ableitungen für Ablauf und Abhängigkeiten (SIN-305). Eingabe: loop_events und loop_snapshot; nichts wird erfunden.
import { PROJEKTE, platzReihenfolge, type Projekt } from "./projekte";
import { STUFEN, inArbeit, type LoopEvent, type SnapshotRow } from "./uebersicht";

export type Zustand = "laeuft" | "wartet" | "fertig" | "leer";
export type AblaufKnoten = { id: string; label: string; projekt: string | null; stufe: string; zustand: Zustand; anzahl: number; x: number; y: number };
export type AblaufKante = { id: string; von: string; nach: string; laeuft: boolean };

const LAEUFT = new Set(["running", "in_progress", "active", "started"]);
const WARTET = new Set(["waiting", "blocked", "needs_review", "needs_human"]);

const ms = (e: LoopEvent) => Date.parse(e.created_at);
const gross = (s: string | null) => (s ?? "").toUpperCase();

/** Ereignisse bis einschließlich `bis`, älteste zuerst. */
export function bisZeitpunkt(events: LoopEvent[], bis: number): LoopEvent[] {
  return events.filter((e) => ms(e) <= bis).sort((a, b) => ms(a) - ms(b));
}

function zustandAus(status: string | null): Zustand {
  if (status && LAEUFT.has(status)) return "laeuft";
  if (status && WARTET.has(status)) return "wartet";
  return status ? "fertig" : "leer";
}

/**
 * Knoten-Graph: gemeinsame Zeile (PLANER, DISPATCHER, PLATZ n, WÄCHTER) und je Projekt eine Bahn mit den festen Stufen.
 * Zustand je Stufe = jüngstes Ereignis bis `bis`. Platz n gehört dem n-ten laufenden Projekt (Dispatcher-Regel).
 * `live` nimmt zusätzlich den Snapshot hinzu; beim Zurückspulen zählen nur Ereignisse.
 */
export function graph(events: LoopEvent[], snapshot: SnapshotRow[], projekte: Projekt[], bis: number, live: boolean, liste: Projekt[] = PROJEKTE) {
  const ev = bisZeitpunkt(events, bis);
  const letzte = new Map<string, LoopEvent>();
  for (const e of ev) if (e.project && e.step) letzte.set(`${e.project}|${gross(e.step)}`, e);

  const laufend = new Set<string>();
  for (const [k, e] of letzte) if (zustandAus(e.status) === "laeuft") laufend.add(k.split("|")[0]);
  if (live) for (const s of inArbeit(snapshot)) laufend.add(s.project);
  const sichtbar = new Set(projekte.map((p) => p.id));
  const plaetze = platzReihenfolge([...laufend].filter((id) => sichtbar.has(id)), liste);

  const knoten: AblaufKnoten[] = [];
  const kanten: AblaufKante[] = [];
  const n = Math.max(plaetze.length, 1);
  const gemeinsam = (id: string, label: string, x: number, zustand: Zustand) => {
    knoten.push({ id, label, projekt: null, stufe: label, zustand, anzahl: 0, x, y: 0 });
  };
  gemeinsam("planer", "PLANER", 0, ev.some((e) => gross(e.step) === "PLAN") ? "fertig" : "leer");
  gemeinsam("dispatcher", "DISPATCHER", 200, ev.some((e) => gross(e.step).startsWith("DISPATCH")) ? "fertig" : "leer");
  for (let i = 0; i < n; i++) gemeinsam(`platz-${i + 1}`, `PLATZ ${i + 1}`, 420 + i * 200, plaetze[i] ? "laeuft" : "leer");
  gemeinsam("waechter", "WÄCHTER", 420 + n * 200, "leer");
  kanten.push({ id: "planer-dispatcher", von: "planer", nach: "dispatcher", laeuft: false });
  for (let i = 0; i < n; i++) kanten.push({ id: `dispatcher-platz-${i + 1}`, von: "dispatcher", nach: `platz-${i + 1}`, laeuft: Boolean(plaetze[i]) });

  projekte.forEach((p, bahn) => {
    const y = 140 + bahn * 110;
    let vorher: string | null = null;
    STUFEN.forEach((stufe, i) => {
      const e = letzte.get(`${p.id}|${stufe}`);
      const anzahl = live ? snapshot.filter((s) => s.project === p.id && gross(s.stage) === stufe).length : 0;
      const id = `${p.id}-${stufe}`;
      const zustand = e ? zustandAus(e.status) : anzahl > 0 ? "fertig" : "leer";
      knoten.push({ id, label: stufe, projekt: p.id, stufe, zustand, anzahl, x: i * 140, y });
      if (vorher) kanten.push({ id: `${vorher}>${id}`, von: vorher, nach: id, laeuft: zustand === "laeuft" });
      vorher = id;
    });
    const platz = plaetze.indexOf(p.id);
    if (platz >= 0) kanten.push({ id: `platz-${platz + 1}>${p.id}`, von: `platz-${platz + 1}`, nach: `${p.id}-WORK`, laeuft: true });
  });
  return { knoten, kanten, plaetze };
}

/** Protokoll eines Knotens: Ereignisse des Projekts und der Stufe bis `bis`, jüngste zuerst. */
export function protokoll(events: LoopEvent[], knoten: AblaufKnoten, bis: number): LoopEvent[] {
  return bisZeitpunkt(events, bis)
    .filter((e) => (knoten.projekt ? e.project === knoten.projekt && gross(e.step) === knoten.stufe : true))
    .reverse();
}

/** Zeitleiste: Zeitpunkte aller Ereignisse, älteste zuerst, ohne Doppelte. */
export const zeitpunkte = (events: LoopEvent[]): number[] => [...new Set(events.map(ms))].sort((a, b) => a - b);

export type DepKnoten = { issue: string; titel: string | null; project: string; spalte: number; blockiert: string[]; brauchtDich: boolean; kritisch: boolean };

/**
 * Abhängigkeiten aus Snapshot-Zeilen mit `issue` und `blocked_by`. Spalte = Länge der längsten Blocker-Kette davor.
 * Kritischer Pfad = längste Kette. Zyklen und unbekannte Blocker brechen nichts: sie zählen als Tiefe 0.
 */
export function abhaengigkeiten(snapshot: SnapshotRow[]): DepKnoten[] {
  const zeilen = new Map<string, SnapshotRow>();
  for (const s of snapshot) if (s.issue) zeilen.set(s.issue, s);
  if (zeilen.size === 0) return [];
  const bekannt = (id: string) => (zeilen.get(id)?.blocked_by ?? []).filter((b) => zeilen.has(b));

  const tiefe = new Map<string, number>();
  const unterwegs = new Set<string>();
  const messen = (id: string): number => {
    const t0 = tiefe.get(id);
    if (t0 !== undefined) return t0;
    if (unterwegs.has(id)) return 0;
    unterwegs.add(id);
    const vor = bekannt(id);
    const t = vor.length === 0 ? 0 : 1 + Math.max(...vor.map(messen));
    tiefe.set(id, t);
    return t;
  };
  for (const id of zeilen.keys()) messen(id);

  const tiefster = (ids: string[]) => [...ids].sort((a, b) => (tiefe.get(b) ?? 0) - (tiefe.get(a) ?? 0) || a.localeCompare(b))[0];
  const kritisch = new Set<string>();
  let aktuell: string | undefined = tiefster([...zeilen.keys()]);
  while (aktuell && !kritisch.has(aktuell)) {
    kritisch.add(aktuell);
    aktuell = tiefster(bekannt(aktuell));
  }
  const hatKette = Math.max(...tiefe.values()) > 0;

  return [...zeilen].map(([issue, s]) => ({
    issue,
    titel: s.title,
    project: s.project,
    spalte: tiefe.get(issue) ?? 0,
    blockiert: s.blocked_by,
    brauchtDich: s.status !== null && WARTET.has(s.status),
    kritisch: hatKette && kritisch.has(issue),
  }));
}
