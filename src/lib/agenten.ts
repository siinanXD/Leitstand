// Ablauf nach Agenten (SIN-486). Rein: Register (agents.json) + loop_events + loop_snapshot → Bahnen mit Zustand, Kosten, Warteschlange.
import registerJson from "../data/agents.json";
import { bisZeitpunkt, detailZeile, signalAus, type Signal, type Zustand } from "./ablauf";
import { projektInfo } from "./projekte";
import type { LoopEvent, SnapshotRow } from "./uebersicht";

export type Agent = {
  id: string;
  name: string;
  auftrag: string;
  workflows: string[];
  budget7d: number | null;
  nurProjekte?: string[];
  /** Optional (SIN-505): Modell und Freigabe-Regel aus dem Register; fehlen sie, entfällt die Zeile. */
  modell?: string;
  freigabe?: string;
  /** SIN-636: Kennung der Rolle, in der diese aufgegangen ist; die Karte trägt dann „zusammengelegt“. */
  zusammengelegt?: string;
};
export const AGENTEN: Agent[] = registerJson.agents;

export type AgentKnoten = { id: string; label: string; zustand: Zustand };
export type Bahn = {
  agent: Agent;
  zustand: Zustand;
  knoten: AgentKnoten[];
  laeufe: LoopEvent[];
  /** Summe der letzten 7 Tage; null = keine Kosten-Daten. */
  kosten7d: number | null;
  /** Offene Issues im Snapshot, deren Stufe zu einem Workflow des Agenten gehört. */
  warteschlange: SnapshotRow[];
};

const LAEUFT = new Set(["running", "in_progress", "active", "started"]);
const WARTET = new Set(["waiting", "blocked", "needs_review", "needs_human"]);
const FERTIG = new Set(["done", "merged", "closed", "canceled"]);
const TAGE_7 = 7 * 24 * 3600 * 1000;

const gross = (s: string | null) => (s ?? "").toUpperCase();
const ms = (e: LoopEvent) => Date.parse(e.created_at);
const zustandAus = (status: string | null): Zustand => (status && LAEUFT.has(status) ? "laeuft" : status && WARTET.has(status) ? "wartet" : status ? "fertig" : "leer");

/** Ein Ereignis gehört zum Agenten, wenn `agent` passt; ohne `agent` entscheidet der Schritt (nur wenn eindeutig). */
export function gehoertZu(e: LoopEvent, agent: Agent, register: Agent[] = AGENTEN): boolean {
  if (e.agent) return e.agent === agent.id;
  const step = gross(e.step);
  return agent.workflows.includes(step) && register.filter((a) => a.workflows.includes(step)).length === 1;
}

/** Produktspezifische Agenten nur, wenn eines der sichtbaren Projekte sie hat. */
export const agentenFuer = (projekte: string[], register: Agent[] = AGENTEN): Agent[] => register.filter((a) => !a.nurProjekte || a.nurProjekte.some((p) => projekte.includes(p)));

/** Agent → Bahn → Zustand. Zustand der Bahn = jüngstes Ereignis des Agenten bis `bis`; je Workflow ebenso. */
export function bahnen(events: LoopEvent[], snapshot: SnapshotRow[], projekte: string[], bis: number, register: Agent[] = AGENTEN): Bahn[] {
  const ev = bisZeitpunkt(events, bis);
  return agentenFuer(projekte, register).map((agent) => {
    const eigene = ev.filter((e) => gehoertZu(e, agent, register));
    const letzteJe = new Map<string, LoopEvent>();
    for (const e of eigene) if (e.step) letzteJe.set(gross(e.step), e);
    const knoten = agent.workflows.map((w) => ({ id: `${agent.id}-${w}`, label: w, zustand: zustandAus(letzteJe.get(w)?.status ?? null) }));
    const letzte = eigene[eigene.length - 1];
    const kosten = eigene.filter((e) => e.cost !== null && ms(e) > bis - TAGE_7);
    return {
      agent,
      zustand: letzte ? zustandAus(letzte.status) : "leer",
      knoten,
      laeufe: [...eigene].reverse().slice(0, 5),
      kosten7d: kosten.length > 0 ? kosten.reduce((s, e) => s + (e.cost ?? 0), 0) : null,
      warteschlange: snapshot.filter((s) => s.issue && projekte.includes(s.project) && agent.workflows.includes(gross(s.stage)) && !(s.status && FERTIG.has(s.status))),
    };
  });
}

/** Agent-Karte nach Figma 46:78 (SIN-505): alles aus echten Daten, fehlende Teile entfallen. */
export type AgentKarte = {
  id: string;
  name: string;
  auftrag: string;
  signal: Signal;
  /** Laufendes Issue/PR + Dauer bzw. Grund; „Keine Daten“, wenn es kein Ereignis gibt. */
  aktuell: string;
  /** „SCHLANGE n · Kosten / Budget $“; Kosten und Budget nur, wenn bekannt. */
  fuss: string;
  /** Anteil des 7-Tage-Budgets, 0 bis 1; null ohne Kosten oder Budget. */
  budgetAnteil: number | null;
};

const dollar = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Kosten 7 Tage als Text, z. B. „6,20 / 20,00 $“; null ohne Kosten. */
export function kostenText(kosten: number | null, budget: number | null): string | null {
  if (kosten === null) return null;
  return budget === null ? `${dollar(kosten)} $` : `${dollar(kosten)} / ${dollar(budget)} $`;
}

export const budgetAnteil = (kosten: number | null, budget: number | null): number | null => (kosten !== null && budget !== null && budget > 0 ? Math.min(1, Math.max(0, kosten / budget)) : null);

export function agentKarte(bahn: Bahn, bis: number, id: string = bahn.agent.id): AgentKarte {
  const letzte = bahn.laeufe[0];
  const kosten = kostenText(bahn.kosten7d, bahn.agent.budget7d);
  return {
    id,
    name: bahn.agent.zusammengelegt ? `${bahn.agent.name} (zusammengelegt)` : bahn.agent.name,
    auftrag: bahn.agent.auftrag,
    signal: letzte ? signalAus(letzte.status) : "leer",
    aktuell: detailZeile(letzte, bis) || "Keine Daten",
    fuss: [`SCHLANGE ${bahn.warteschlange.length}`, kosten].filter(Boolean).join(" · "),
    budgetAnteil: budgetAnteil(bahn.kosten7d, bahn.agent.budget7d),
  };
}

/** Lieferkette (alle Projekte) und Produkt-Agenten (je Projekt), Spalten nach Figma D4 (47:28). */
export const KETTE = ["research", "planer", "design", "coding", "pruefen", "betrieb"];
export const PRODUKT = ["content", "video", "marketing"];
const SPALTE: Record<string, number> = { research: 0, planer: 1, design: 2, coding: 3, pruefen: 4, betrieb: 5, content: 1, video: 4, marketing: 5 };
/** Kanten Planer → Content, Betrieb → Video → Marketing; Planer und Betrieb liegen in der Kette. */
const PRODUKT_KANTEN = [
  ["kette", "planer", "content"],
  ["kette", "betrieb", "video"],
  ["produkt", "video", "marketing"],
];
/** Maße nach D4: Karte 196×104, Abstand 32, Bahn-Kopf 36. */
export const AGENT_LAYOUT = { x0: 24, schritt: 228, breite: 196, hoehe: 104, kopf: 36, bahn: 168, hinweis: 72, abstand: 8 };

export type GraphKnoten = { karte: AgentKarte; bahn: Bahn; lane: string; x: number; y: number };
export type AgentLane = { id: string; name: string; projekt: string | null; y: number; hoehe: number; hinweis: string | null };
export type AgentKante = { id: string; von: string; nach: string; laeuft: boolean };

const KEIN_PRODUKT = "Keine Produkt-Agenten · nur für Projekte mit Content, Video oder Marketing";

/** Graph „Nach Agent“: Kette über alle Projekte, je Projekt eine Produkt-Bahn (nur mit passenden Agenten), Kanten. */
export function agentGraph(events: LoopEvent[], snapshot: SnapshotRow[], projekte: string[], bis: number, register: Agent[] = AGENTEN) {
  const nurIn = (ids: string[], rows: Bahn[]) => ids.flatMap((id) => rows.filter((b) => b.agent.id === id && id in SPALTE));
  const knoten: GraphKnoten[] = [];
  const lanes: AgentLane[] = [];
  const L = AGENT_LAYOUT;
  let y = 0;
  const lege = (lane: AgentLane, rows: Bahn[]) => {
    lanes.push(lane);
    for (const b of rows) knoten.push({ karte: agentKarte(b, bis, `${lane.id}-${b.agent.id}`), bahn: b, lane: lane.id, x: L.x0 + SPALTE[b.agent.id] * L.schritt, y: lane.y + L.kopf });
    y += lane.hoehe + L.abstand;
  };
  lege({ id: "kette", name: "Lieferkette · alle Projekte", projekt: null, y, hoehe: L.bahn, hinweis: null }, nurIn(KETTE, bahnen(events, snapshot, projekte, bis, register)));
  for (const p of projekte) {
    const rows = nurIn(PRODUKT, bahnen(events.filter((e) => e.project === p), snapshot, [p], bis, register)).filter((b) => !b.agent.nurProjekte || b.agent.nurProjekte.includes(p));
    lege({ id: p, name: `Produkt · ${projektInfo(p).name}`, projekt: p, y, hoehe: rows.length > 0 ? L.bahn : L.hinweis, hinweis: rows.length > 0 ? null : KEIN_PRODUKT }, rows);
  }
  const finde = (lane: string, agent: string) => knoten.find((k) => k.lane === lane && k.bahn.agent.id === agent);
  const paare: [GraphKnoten | undefined, GraphKnoten | undefined][] = KETTE.slice(1).map((id, i) => [finde("kette", KETTE[i]), finde("kette", id)]);
  for (const p of projekte) for (const [lane, von, nach] of PRODUKT_KANTEN) paare.push([finde(lane === "kette" ? "kette" : p, von), finde(p, nach)]);
  const kanten: AgentKante[] = paare.flatMap(([a, b]) => (a && b ? [{ id: `${a.karte.id}>${b.karte.id}`, von: a.karte.id, nach: b.karte.id, laeuft: a.karte.signal === "laeuft" || b.karte.signal === "laeuft" }] : []));
  return { knoten, lanes, kanten, breite: L.x0 * 2 + 5 * L.schritt + L.breite, hoehe: y - L.abstand };
}
