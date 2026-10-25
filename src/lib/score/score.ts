/**
 * SIN-1059: Score je Agent-Lauf. Reine Funktionen: aus den Daten eines gemergten PR (oder dem Lauf-Ereignis einer Rolle ohne PR)
 * entsteht ein Eintrag nach `docs/schemas/score.json`. Kein Netz; das Sammeln der Daten macht `scripts/score/score.ts`.
 * Unbekanntes bleibt `null`, nie geschätzt.
 */
import { bereichVon } from "../bereiche";

/** Rollen ohne PR: ihr Lauf-Ereignis ist der Score. Schritt-Namen wie in `loop_events`. */
export const ROLLEN_OHNE_PR = ["planer", "content-fabrik", "designer"] as const;

const TAG_MS = 86_400_000;

export type Ereignis = { created_at: string; step: string; status: string; grund: string | null; pr?: number | null };
export type LaufEreignis = { created_at: string; step: string; status: string; grund: string | null; issue: string | null; cost: number | null };

export type Fehler = { bereich: string | null; art: "unklar"; ursache: string; datei: string | null };

export type Score = {
  produkt: string;
  issue: string | null;
  pr: number | null;
  rolle: string;
  /** Bei Rollen ohne PR der Zeitpunkt des Lauf-Ereignisses, sonst null. */
  quelle: string | null;
  bereiche: string[];
  direkt: boolean;
  reparatur_runden: number;
  pruefer_runden: number;
  minuten: number | null;
  kosten_eur: number | null;
  fehler: Fehler[];
  build_erster_lauf_gruen: boolean | null;
  eingriffe_sinan: number;
  dateien_ausserhalb_scope: number | null;
  minuten_bis_gruen: number | null;
  regression_24h: boolean | null;
};

export type PrEingabe = {
  produkt: string;
  issue: string | null;
  pr: number;
  rolle: string;
  /** Beginn des Laufs (Dispatch); fehlt er, zählt das Anlegen des PR. */
  start: string | null;
  erstellt: string;
  gemergt: string;
  dateien: string[];
  /** Schreibpfade aus `worker-pfade`; null = nicht angegeben. */
  workerPfade: string[] | null;
  /** Abgeschlossene `build`-Läufe in beliebiger Reihenfolge. */
  builds: { fertig: string; ergebnis: string }[];
  /** Pushes, Kommentare und Labels am PR mit Urheber. */
  eingriffe: { von: string; art: string }[];
  /** Zeitpunkte von Revert-Commits auf main, die diesen PR zurücknehmen. */
  reverts: string[];
  /** Ereignisse des Produkts (Issue und Abnahme); gefiltert wird hier. */
  ereignisse: Ereignis[];
  owner: string;
  kostenUsd: number | null;
  kursUsdEur: number | null;
  jetzt: Date;
};

const minuten = (von: string, bis: string) => Math.max(0, Math.round((Date.parse(bis) - Date.parse(von)) / 60_000));
const imScope = (datei: string, pfade: string[]) => pfade.some((p) => datei === p || datei.startsWith(p.endsWith("/") ? p : `${p}/`));

export function scoreAusPr(e: PrEingabe): Score {
  const reparatur = e.ereignisse.filter((x) => x.step === "repair" && x.status === "start").length;
  const pruefer = e.ereignisse.filter((x) => x.step === "pruefer" && (x.status === "ok" || x.status === "fehler")).length;
  const bereiche = [...new Set(e.dateien.map(bereichVon).filter((b): b is NonNullable<typeof b> => !!b))].sort();
  const builds = [...e.builds].sort((a, b) => a.fertig.localeCompare(b.fertig));
  const gruen = builds.find((b) => b.ergebnis === "success");
  const bis = Date.parse(e.gemergt) + TAG_MS;
  const nachMerge = (zeit: string) => Date.parse(zeit) > Date.parse(e.gemergt) && Date.parse(zeit) <= bis;
  const rotNachMerge = e.reverts.some(nachMerge) || e.ereignisse.some((x) => x.step === "abnahme" && x.status === "fehler" && nachMerge(x.created_at));
  return {
    produkt: e.produkt,
    issue: e.issue,
    pr: e.pr,
    rolle: e.rolle,
    quelle: null,
    bereiche,
    direkt: reparatur === 0 && pruefer <= 1,
    reparatur_runden: reparatur,
    pruefer_runden: pruefer,
    minuten: minuten(e.start ?? e.erstellt, e.gemergt),
    kosten_eur: e.kostenUsd !== null && e.kursUsdEur ? Math.round(e.kostenUsd * e.kursUsdEur * 100) / 100 : null,
    fehler: e.ereignisse.filter((x) => x.step === "repair" && x.status === "fehler" && x.grund).map((x) => ({ bereich: bereiche[0] ?? null, art: "unklar" as const, ursache: x.grund as string, datei: null })),
    build_erster_lauf_gruen: builds.length ? builds[0].ergebnis === "success" : null,
    eingriffe_sinan: e.eingriffe.filter((x) => x.von.toLowerCase() === e.owner.toLowerCase()).length,
    dateien_ausserhalb_scope: e.workerPfade ? e.dateien.filter((d) => !imScope(d, e.workerPfade as string[])).length : null,
    minuten_bis_gruen: gruen ? minuten(e.erstellt, gruen.fertig) : null,
    // Erst nach 24 h steht fest, dass nichts zurückgenommen wurde; vorher bleibt es offen (null).
    regression_24h: rotNachMerge ? true : e.jetzt.getTime() >= bis ? false : null,
  };
}

/** Score einer Rolle ohne PR aus ihrem beendeten Lauf-Ereignis; andere Schritte und Zwischenstände ergeben null. */
export function scoreAusLauf(produkt: string, e: LaufEreignis): Score | null {
  if (!(ROLLEN_OHNE_PR as readonly string[]).includes(e.step) || (e.status !== "ok" && e.status !== "fehler")) return null;
  return {
    produkt,
    issue: e.issue,
    pr: null,
    rolle: e.step,
    quelle: e.created_at,
    bereiche: [],
    direkt: e.status === "ok",
    reparatur_runden: 0,
    pruefer_runden: 0,
    minuten: null,
    kosten_eur: null,
    fehler: e.status === "fehler" ? [{ bereich: null, art: "unklar", ursache: e.grund?.trim() || "ohne Grund", datei: null }] : [],
    build_erster_lauf_gruen: null,
    eingriffe_sinan: 0,
    dateien_ausserhalb_scope: null,
    minuten_bis_gruen: null,
    regression_24h: null,
  };
}

const PRAEFIX = "score: ";

/** `loop_events` hat keine payload-Spalte (SIN-848): der Score steht als JSON in `grund`. */
export const scoreGrund = (s: Score) => `${PRAEFIX}${JSON.stringify(s)}`;

/** Gibt es zu diesem Lauf schon eine Score-Zeile? Schlüssel: Produkt, Rolle, PR, Quelle. */
export function bereitsBewertet(zeilen: { grund: string | null }[], s: Score): boolean {
  return zeilen.some((z) => {
    if (!z.grund?.startsWith(PRAEFIX)) return false;
    try {
      const o = JSON.parse(z.grund.slice(PRAEFIX.length)) as Partial<Score>;
      return o.produkt === s.produkt && o.rolle === s.rolle && o.pr === s.pr && (o.quelle ?? null) === s.quelle;
    } catch {
      return false;
    }
  });
}
