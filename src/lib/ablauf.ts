// Reine Ableitungen für Ablauf und Abhängigkeiten (SIN-305). Eingabe: loop_events und loop_snapshot; nichts wird erfunden.
import { PROJEKTE, platzReihenfolge, projektInfo, type Projekt } from "./projekte";
import { BETRIEB, STUFEN, inArbeit, type LoopEvent, type SnapshotRow } from "./uebersicht";

export type Zustand = "laeuft" | "wartet" | "fertig" | "leer";
/** Farbsignal des Status-Quadrats: grün, gelb, rot, orange (läuft) oder neutral. Nie die Projektfarbe. */
export type Signal = "ok" | "warn" | "error" | "laeuft" | "leer";
export type AblaufKnoten = {
  id: string;
  label: string;
  projekt: string | null;
  stufe: string;
  zustand: Zustand;
  anzahl: number;
  x: number;
  y: number;
  signal: Signal;
  /** Detailzeile (SIN-503) aus echten Daten; fehlt ein Wert, fehlt der Teil. Leer, wenn nichts bekannt ist. */
  detail: string;
};
export type AblaufBahn = { id: string; name: string; farbe: string | null; y: number };
/** Maße nach Figma D2 (21:2): Knoten 170×56, Bahn 96 hoch, 30 Abstand zwischen Knoten, Bahn-Name links. */
export const LAYOUT = { x0: 140, schritt: 200, breite: 170, hoehe: 56, bahn: 96, abstand: 16 };
const MAX_REPAIR = 3;
const HAENGT_MS = 60 * 60 * 1000;
export type AblaufKante = { id: string; von: string; nach: string; laeuft: boolean };

const LAEUFT = new Set(["running", "in_progress", "active", "started"]);
const WARTET = new Set(["waiting", "blocked", "needs_review", "needs_human"]);

const ms = (e: LoopEvent) => Date.parse(e.created_at);
const gross = (s: string | null) => (s ?? "").toUpperCase();

const OK = new Set(["ok", "done", "success", "merged", "fertig", "completed"]);
const FEHLER = new Set(["fehler", "failed", "failure", "error", "red"]);

/** Farbsignal aus dem Status des jüngsten Ereignisses. Unbekannte Status bleiben neutral. */
export function signalAus(status: string | null): Signal {
  const s = (status ?? "").toLowerCase();
  if (LAEUFT.has(s)) return "laeuft";
  if (WARTET.has(s)) return "warn";
  if (FEHLER.has(s)) return "error";
  if (OK.has(s)) return "ok";
  return "leer";
}

/** Dauer kurz: „5 MIN“, „3 H“, „2 T“. */
export function dauerText(dauer: number): string {
  const min = Math.max(0, Math.round(dauer / 60000));
  if (min < 60) return `${min} MIN`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} H` : `${Math.round(h / 24)} T`;
}

const STATUS_TEXT: Record<Signal, string> = { ok: "ERLEDIGT", warn: "WARTET", error: "ROT", laeuft: "LÄUFT", leer: "" };

/**
 * Detailzeile eines Knotens aus dem jüngsten Ereignis: PR-Nr., Issue, Status, Repair-Runde, Dauer bzw. „hängt seit“.
 * `repair` = Runde (Anzahl Repair-Starts zum PR). Fehlt ein Wert, entfällt der Teil; nichts wird erfunden.
 */
export function detailZeile(e: LoopEvent | undefined, bis: number, opts: { repair?: number; anzahl?: number } = {}): string {
  const teile: string[] = [];
  if (opts.anzahl) teile.push(`${opts.anzahl} IN SCHLANGE`);
  if (e) {
    const signal = signalAus(e.status);
    const alt = bis - ms(e);
    const haengt = signal === "laeuft" && alt >= HAENGT_MS;
    if (e.pr !== null) teile.push(`PR #${e.pr}`);
    if (e.issue) teile.push(e.issue);
    if (STATUS_TEXT[signal] && !haengt) teile.push(STATUS_TEXT[signal]);
    if (opts.repair) teile.push(`REPAIR ${Math.min(opts.repair, MAX_REPAIR)}/${MAX_REPAIR}`);
    if (haengt) teile.push(`HÄNGT SEIT ${dauerText(alt)}`);
    else if (signal === "laeuft") teile.push(dauerText(alt));
  }
  return teile.join(" · ");
}

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
  const { x0, schritt, bahn: bahnHoehe, abstand } = LAYOUT;
  const n = Math.max(plaetze.length, 1);
  const juengster = (pred: (e: LoopEvent) => boolean) => [...ev].reverse().find(pred);
  const gemeinsam = (id: string, label: string, x: number, zustand: Zustand, signal: Signal, detail: string) => {
    knoten.push({ id, label, projekt: null, stufe: label, zustand, anzahl: 0, x, y: abstand + 4, signal, detail });
  };
  const planE = juengster((e) => gross(e.step) === "PLAN");
  const queueE = juengster((e) => gross(e.step) === "QUEUE");
  gemeinsam("planer", "PLANER", x0, planE ? "fertig" : "leer", planE ? signalAus(planE.status) : "leer", detailZeile(planE, bis));
  gemeinsam("dispatcher", "DISPATCHER", x0 + schritt, queueE ? "fertig" : "leer", queueE ? signalAus(queueE.status) : "leer", plaetze.length > 0 ? `${plaetze.length} BELEGT` : detailZeile(queueE, bis));
  for (let i = 0; i < n; i++) {
    const belegt = plaetze[i];
    const arbeit = belegt ? juengster((e) => e.project === belegt && gross(e.step) === "WORK") : undefined;
    const issue = arbeit?.issue ?? (belegt ? inArbeit(snapshot).find((s) => s.project === belegt)?.issue : null);
    const detail = belegt ? [projektInfo(belegt, liste).name.toUpperCase(), issue].filter(Boolean).join(" · ") : "";
    gemeinsam(`platz-${i + 1}`, `PLATZ ${i + 1}`, x0 + (2 + i) * schritt, belegt ? "laeuft" : "leer", belegt ? "laeuft" : "leer", detail);
  }
  gemeinsam("waechter", "WÄCHTER", x0 + (2 + n) * schritt, "leer", "leer", "");
  kanten.push({ id: "planer-dispatcher", von: "planer", nach: "dispatcher", laeuft: false });
  for (let i = 0; i < n; i++) kanten.push({ id: `dispatcher-platz-${i + 1}`, von: "dispatcher", nach: `platz-${i + 1}`, laeuft: Boolean(plaetze[i]) });

  const bahnen: AblaufBahn[] = [{ id: "gemeinsam", name: "GEMEINSAM", farbe: null, y: 0 }];
  projekte.forEach((p, bahn) => {
    const bahnY = (bahn + 1) * (bahnHoehe + abstand);
    const y = bahnY + abstand + 4;
    bahnen.push({ id: p.id, name: p.name.toUpperCase(), farbe: p.farbe, y: bahnY });
    const repairs = ev.filter((e) => e.project === p.id && gross(e.step) === "REPAIR" && e.status === "start");
    const repairE = juengster((e) => e.project === p.id && gross(e.step) === "REPAIR");
    let vorher: string | null = null;
    STUFEN.forEach((stufe, i) => {
      const e = letzte.get(`${p.id}|${stufe}`);
      const anzahl = live ? snapshot.filter((s) => s.project === p.id && gross(s.stage) === stufe).length : 0;
      const id = `${p.id}-${stufe}`;
      const zustand = e ? zustandAus(e.status) : anzahl > 0 ? "fertig" : "leer";
      const repair = stufe === "PR" && repairE && (e?.pr == null || e.pr === repairE.pr) ? repairs.filter((r) => r.pr === repairE.pr).length : 0;
      knoten.push({
        id, label: stufe, projekt: p.id, stufe, zustand, anzahl, x: x0 + i * schritt, y,
        signal: e ? signalAus(e.status) : anzahl > 0 ? "ok" : "leer",
        detail: detailZeile(e, bis, { repair, anzahl }),
      });
      if (vorher) kanten.push({ id: `${vorher}>${id}`, von: vorher, nach: id, laeuft: zustand === "laeuft" });
      vorher = id;
    });
    const platz = plaetze.indexOf(p.id);
    if (platz >= 0) kanten.push({ id: `platz-${platz + 1}>${p.id}`, von: `platz-${platz + 1}`, nach: `${p.id}-WORK`, laeuft: true });
  });
  return { knoten, kanten, plaetze, bahnen };
}

/** Protokoll eines Knotens: Ereignisse des Projekts und der Stufe bis `bis`, jüngste zuerst. */
export function protokoll(events: LoopEvent[], knoten: AblaufKnoten, bis: number): LoopEvent[] {
  return bisZeitpunkt(events, bis)
    .filter((e) => (knoten.projekt ? e.project === knoten.projekt && gross(e.step) === knoten.stufe : true))
    .reverse();
}

/** Namen in den Ereignissen, die der Ablauf nicht kennt (nach der Zuordnung). Betriebs-Schritte zählen als bekannt. */
export function unbekannte(events: LoopEvent[], liste: Projekt[] = PROJEKTE): { projekte: string[]; schritte: string[] } {
  const ids = new Set(liste.map((p) => p.id));
  const schritte = new Set([...STUFEN, ...BETRIEB]);
  const projekte = new Set<string>();
  const unbekannt = new Set<string>();
  for (const e of events) {
    if (e.project && !ids.has(e.project)) projekte.add(e.project);
    if (e.step && !schritte.has(gross(e.step))) unbekannt.add(e.step);
  }
  return { projekte: [...projekte].sort(), schritte: [...unbekannt].sort() };
}

/** Zeitleiste:Zeitpunkte aller Ereignisse, älteste zuerst, ohne Doppelte. */
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
