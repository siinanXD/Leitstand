// Modell-Routing und Messung je Rolle und Modell (SIN-942). Rein, ohne Netz.
// Das Modell einer Rolle steht nur in docs/autonomy/modelle.json; hier wird gelesen und gemessen, nie umgeschaltet.
import modelleJson from "../../../docs/autonomy/modelle.json";

export type RollenModell = { modell: string; kontextfenster: number; werkzeuge: string[]; schritte: string[] };
export const MODELLE = modelleJson.rollen as Record<string, RollenModell>;

/** Modell einer Rolle aus modelle.json; unbekannte Rolle ist ein Fehler, kein stiller Standard. */
export function modellFuer(rolle: string, tabelle: Record<string, RollenModell> = MODELLE): string {
  const r = tabelle[rolle];
  if (!r) throw new Error(`Rolle ${rolle} fehlt in docs/autonomy/modelle.json`);
  return r.modell;
}

/** Ereignis aus loop_events. `modell` gibt es (noch) nicht als Spalte; fehlt es, gilt das Modell der Tabelle. */
export type MessEreignis = { created_at: string; step: string | null; agent?: string | null; status: string | null; issue: string | null; pr: number | null; cost?: number | null; modell?: string | null };
/** Ergebnis der Durchstich-Kennzahl (src/lib/kennzahlen/durchstich.ts): Issues ohne und mit Eingriff. */
export type DurchstichIssues = { durchstich: readonly string[]; mitEingriff: readonly string[] };

export type Messung = {
  rolle: string;
  modell: string;
  issues: number;
  /** Anteil der Issues der Rolle, die ohne Eingriff live gingen; null, wenn keins fertig bewertet ist. */
  durchstichQuote: number | null;
  /** Mittel der Prüfer-Läufe (ok oder fehler) je PR, an dem die Rolle beteiligt war; null ohne PR. */
  prueferRunden: number | null;
  /** Summe `cost` der Rolle je Issue, US-Dollar; null, wenn kein Ereignis Kosten trägt. */
  kostenJeIssue: number | null;
  /** Mittlere Minuten vom ersten bis zum letzten Ereignis der Rolle je Issue; null ohne Issue. */
  dauerJeIssueMin: number | null;
};

const mittel = (z: number[]) => (z.length === 0 ? null : z.reduce((a, b) => a + b, 0) / z.length);
const runde = (v: number | null, stellen = 2) => (v === null ? null : Math.round(v * 10 ** stellen) / 10 ** stellen);
const klein = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Die vier Messgrößen je Rolle und Modell aus den Ereignissen eines Zeitraums.
 * shortcut: Prüfer-Läufe und Durchstich werden dem Issue/PR zugeordnet, nicht dem einzelnen Modell-Aufruf;
 * ausbauen, wenn mehrere Modelle derselben Rolle im selben PR vorkommen.
 */
export function messeRollen(events: readonly MessEreignis[], durchstich: DurchstichIssues, tabelle: Record<string, RollenModell> = MODELLE): Messung[] {
  const prueferJePr = new Map<number, number>();
  for (const e of events) if (klein(e.step) === "pruefer" && e.pr != null && (e.status === "ok" || e.status === "fehler")) prueferJePr.set(e.pr, (prueferJePr.get(e.pr) ?? 0) + 1);
  const fertig = new Set([...durchstich.durchstich, ...durchstich.mitEingriff]);
  const ergebnis: Messung[] = [];
  for (const [rolle, cfg] of Object.entries(tabelle)) {
    const namen = new Set(cfg.schritte.map(klein));
    const meine = events.filter((e) => namen.has(klein(e.step)) || namen.has(klein(e.agent)));
    const modelle = new Set(meine.map((e) => e.modell || cfg.modell));
    for (const modell of modelle) {
      const evs = meine.filter((e) => (e.modell || cfg.modell) === modell);
      const jeIssue = new Map<string, MessEreignis[]>();
      for (const e of evs) if (e.issue) jeIssue.set(e.issue, [...(jeIssue.get(e.issue) ?? []), e]);
      const bewertet = [...jeIssue.keys()].filter((k) => fertig.has(k));
      const prs = new Set(evs.flatMap((e) => (e.pr != null ? [e.pr] : [])));
      const kosten = evs.filter((e) => typeof e.cost === "number");
      const dauern = [...jeIssue.values()].map((l) => {
        const zeiten = l.map((e) => Date.parse(e.created_at)).filter((t) => !Number.isNaN(t));
        return zeiten.length === 0 ? null : (Math.max(...zeiten) - Math.min(...zeiten)) / 60_000;
      });
      ergebnis.push({
        rolle,
        modell,
        issues: jeIssue.size,
        durchstichQuote: bewertet.length === 0 ? null : runde(bewertet.filter((k) => durchstich.durchstich.includes(k)).length / bewertet.length),
        prueferRunden: runde(mittel([...prs].map((p) => prueferJePr.get(p) ?? 0).filter((n) => n > 0))),
        kostenJeIssue: kosten.length === 0 || jeIssue.size === 0 ? null : runde(kosten.reduce((s, e) => s + (e.cost ?? 0), 0) / jeIssue.size, 4),
        dauerJeIssueMin: runde(mittel(dauern.filter((d): d is number => d !== null)), 1),
      });
    }
  }
  return ergebnis;
}

/** Wert aus loop_snapshot.modelle (jsonb); unlesbares gibt eine leere Liste, damit die Seite nie bricht. */
export function leseMessungen(roh: unknown): { stand: string | null; messungen: Messung[] } {
  const o = roh && typeof roh === "object" && !Array.isArray(roh) ? (roh as { stand?: unknown; messungen?: unknown }) : {};
  const messungen = Array.isArray(o.messungen) ? o.messungen.filter((m): m is Messung => !!m && typeof (m as Messung).rolle === "string" && typeof (m as Messung).modell === "string") : [];
  return { stand: typeof o.stand === "string" ? o.stand : null, messungen };
}
