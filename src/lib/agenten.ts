// Ablauf nach Agenten (SIN-486). Rein: Register (agents.json) + loop_events + loop_snapshot → Bahnen mit Zustand, Kosten, Warteschlange.
import registerJson from "../data/agents.json";
import { bisZeitpunkt, type Zustand } from "./ablauf";
import type { LoopEvent, SnapshotRow } from "./uebersicht";

export type Agent = { id: string; name: string; auftrag: string; workflows: string[]; budget7d: number | null; nurProjekte?: string[] };
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
