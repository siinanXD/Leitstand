/**
 * Betriebs-Agent (SIN-513): reine Funktionen. Modellkosten je Lauf begrenzen, Ereignis für loop_events bauen,
 * Tagesbericht aus dem Lern-Bericht (SIN-512) ableiten. Kein Netz, kein Dateizugriff.
 */
import type { Bericht } from "../lernen/lernen";

export const BETRIEB_AGENT = "betrieb";
/** Obergrenze je Lauf und je Tag in US-Dollar, überschreibbar per Env (BETRIEB_MAX_USD_LAUF / _TAG). */
export const STANDARD_MAX_USD_LAUF = 0.25;
export const STANDARD_MAX_USD_TAG = 1;

export type Budget = { lauf: number; tag: number };
export type BudgetPruefung = { erlaubt: boolean; grund: string | null; restUsd: number };

export function budgetAusEnv(env: Record<string, string | undefined>): Budget {
  const zahl = (v: string | undefined, standard: number) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : standard;
  };
  return { lauf: zahl(env.BETRIEB_MAX_USD_LAUF, STANDARD_MAX_USD_LAUF), tag: zahl(env.BETRIEB_MAX_USD_TAG, STANDARD_MAX_USD_TAG) };
}

/** Darf ein Lauf mit geschätzten Kosten starten? `heuteUsd` = bereits gebuchte Kosten des Agenten `betrieb` heute. */
export function pruefeBudget(geschaetztUsd: number, heuteUsd: number, budget: Budget): BudgetPruefung {
  const rest = Math.max(0, budget.tag - heuteUsd);
  if (geschaetztUsd > budget.lauf) return { erlaubt: false, grund: `Schätzung ${geschaetztUsd.toFixed(2)} $ über Laufgrenze ${budget.lauf.toFixed(2)} $`, restUsd: rest };
  if (geschaetztUsd > rest) return { erlaubt: false, grund: `Tagesgrenze ${budget.tag.toFixed(2)} $ erreicht (heute ${heuteUsd.toFixed(2)} $)`, restUsd: rest };
  return { erlaubt: true, grund: null, restUsd: rest - geschaetztUsd };
}

/** Summe der heute gebuchten Kosten des Agenten `betrieb`. */
export function kostenHeute(events: { agent: string | null; cost: number | null; created_at: string }[], jetzt: Date): number {
  const tag = jetzt.toISOString().slice(0, 10);
  return events.filter((e) => e.agent === BETRIEB_AGENT && e.created_at.startsWith(tag)).reduce((s, e) => s + (e.cost ?? 0), 0);
}

export type BetriebEreignis = {
  project: "leitstand";
  agent: typeof BETRIEB_AGENT;
  step: "tagesbericht" | "quellen" | "lernen";
  status: "ok" | "fehler" | "needs_human" | "uebersprungen";
  cost: number;
  run_id: string | null;
  run_url: string | null;
};

export function betriebEreignis(step: BetriebEreignis["step"], status: BetriebEreignis["status"], kostenUsd: number, run: { id?: string; url?: string } = {}): BetriebEreignis {
  return { project: "leitstand", agent: BETRIEB_AGENT, step, status, cost: Math.round(kostenUsd * 10000) / 10000, run_id: run.id ?? null, run_url: run.url ?? null };
}

export type Tagesbericht = {
  schema: "betrieb-tagesbericht/1";
  erstellt: string;
  titel: string;
  zeilen: string[];
  /** Nur wahr, wenn etwas Sinans Entscheidung braucht → „Braucht dich“ und Push. */
  brauchtDich: boolean;
  kostenUsd: number;
};

/** Tagesbericht ausschließlich aus echten Berichtsdaten; ohne Bericht steht dort „keine Daten“, nichts wird erfunden. */
export function tagesbericht(lernen: Bericht | null, kostenUsd: number, jetzt: Date): Tagesbericht {
  const erstellt = jetzt.toISOString();
  if (!lernen) return { schema: "betrieb-tagesbericht/1", erstellt, titel: "Tagesbericht: keine Daten", zeilen: ["Der Lern-Bericht fehlt, es gibt nichts zu berichten."], brauchtDich: false, kostenUsd };
  const zeilen = [`${lernen.ereignisse} Ereignisse in ${lernen.zeitraumStunden} h.`];
  for (const f of lernen.fehler) zeilen.push(`${f.anzahl}× ${f.thema}`);
  for (const s of lernen.skillVorschlaege) zeilen.push(`Skill-Vorschlag: ${s.name} (${s.anzahl}×)`);
  zeilen.push(`Modellkosten Betrieb: ${kostenUsd.toFixed(2)} $`);
  const brauchtDich = lernen.fehler.length > 0;
  return { schema: "betrieb-tagesbericht/1", erstellt, titel: brauchtDich ? `Tagesbericht: ${lernen.fehler.length} wiederkehrende Fehler` : "Tagesbericht: ruhig", zeilen, brauchtDich, kostenUsd };
}
