// Ende-zu-Ende-Nachweis (SIN-1054). Rein, ohne Netz. Je Issue die Stationen von Todo bis Live-Probe aus Linear und loop_events;
// die erste fehlende Station ist die Hänge-Station. Kennzahlen und Entscheidung zum Kanarienlauf stehen ebenfalls hier.
import type { Ereignis } from "../kennzahlen/durchstich";

export const STATIONEN = ["todo", "worker", "pr", "pruefer", "merge", "deploy", "probe", "done"] as const;
export type Station = (typeof STATIONEN)[number];
export const STATION_NAME: Record<Station, string> = { todo: "Todo", worker: "Worker-Start", pr: "PR offen", pruefer: "Prüfer", merge: "Merge", deploy: "Deploy", probe: "Live-Probe", done: "Done" };
export const FENSTER_TAGE = 7;
export const KANARIE_LABEL = "kanarie";

export type StreckeIssue = { kennung: string; todoAm: string | null; doneAm: string | null; labels?: readonly string[]; offen?: boolean };
export type Strecke = { kennung: string; zeiten: Partial<Record<Station, string>>; haengtBei: Station | null; dauerMin: number | null };
export type E2eKennzahl = { fenster_tage: number; gesamt: number; live: number; median_min: number | null; haengt_meist: Station | null; haengt: { kennung: string; station: Station }[] };

const ms = (iso: string) => Date.parse(iso);
const ok = (e: Ereignis) => e.status === "ok";
const erstes = (liste: readonly Ereignis[], ab: string) => liste.filter((e) => ms(e.created_at) > ms(ab)).sort((a, b) => ms(a.created_at) - ms(b.created_at))[0];

/** Zeitpunkt je erreichter Station. Jede Station zählt nur nach der vorherigen; Prüfer, Merge und Deploy gehören zum selben PR. */
export function stationen(i: StreckeIssue, ereignisse: readonly Ereignis[]): Strecke {
  const z: Partial<Record<Station, string>> = {};
  const eigene = ereignisse.filter((e) => e.issue === i.kennung);
  if (i.todoAm) z.todo = i.todoAm;
  const start = z.todo && erstes(eigene.filter((e) => e.step === "worker" && e.status === "start"), new Date(ms(z.todo) - 1).toISOString());
  if (start) z.worker = start.created_at;
  // Mehrere PR-Versuche: der Versuch, der am weitesten kommt, bestimmt die Strecke.
  const prs = z.worker ? eigene.filter((e) => e.step === "worker" && ok(e) && e.pr != null && ms(e.created_at) > ms(z.worker!)) : [];
  let best: Partial<Record<Station, string>> = {};
  for (const pr of prs) {
    const t: Partial<Record<Station, string>> = { pr: pr.created_at };
    const nach = (step: string, ab: string | undefined) => (ab ? erstes(ereignisse.filter((e) => e.step === step && ok(e) && e.pr === pr.pr), ab)?.created_at : undefined);
    t.pruefer = nach("pruefer", t.pr);
    t.merge = nach("merge", t.pruefer);
    t.deploy = nach("deploy", t.merge);
    t.probe = t.deploy ? erstes(ereignisse.filter((e) => e.step === "abnahme" && ok(e) && e.issue === i.kennung), t.deploy)?.created_at : undefined;
    const erreicht = Object.fromEntries(Object.entries(t).filter(([, v]) => v));
    if (Object.keys(erreicht).length > Object.keys(best).length) best = erreicht;
  }
  Object.assign(z, best);
  if (z.probe && i.doneAm && ms(i.doneAm) >= ms(z.probe)) z.done = i.doneAm;
  const haengtBei = STATIONEN.find((s) => !z[s]) ?? null;
  const dauerMin = z.todo && z.done ? Math.round((ms(z.done) - ms(z.todo)) / 60_000) : null;
  return { kennung: i.kennung, zeiten: z, haengtBei, dauerMin };
}

/** Kennzahlen über Issues der letzten 7 Tage (die Auswahl trifft das Skript). Kanarien-Issues zählen mit. */
export function kennzahl(strecken: readonly Strecke[]): E2eKennzahl {
  const live = strecken.filter((s) => s.haengtBei === null);
  const dauern = live.map((s) => s.dauerMin!).sort((a, b) => a - b);
  const mitte = Math.floor(dauern.length / 2);
  const median = dauern.length === 0 ? null : dauern.length % 2 ? dauern[mitte] : Math.round((dauern[mitte - 1] + dauern[mitte]) / 2);
  const haengt = strecken.filter((s) => s.haengtBei !== null).map((s) => ({ kennung: s.kennung, station: s.haengtBei! }));
  const zaehl = new Map<Station, number>();
  for (const h of haengt) zaehl.set(h.station, (zaehl.get(h.station) ?? 0) + 1);
  // Bei Gleichstand gewinnt die frühere Station auf der Strecke (sort ist stabil).
  const meist = STATIONEN.filter((s) => zaehl.has(s)).sort((a, b) => zaehl.get(b)! - zaehl.get(a)!)[0] ?? null;
  return { fenster_tage: FENSTER_TAGE, gesamt: strecken.length, live: live.length, median_min: median, haengt_meist: meist, haengt };
}

/** „Ende-zu-Ende: 9 von 12 live, Median 3 h 10 min, hängt meist bei: Live-Probe“ */
export function zeile(k: E2eKennzahl): string {
  if (k.gesamt === 0) return `Ende-zu-Ende: keine Issues in ${k.fenster_tage} Tagen`;
  const min = k.median_min;
  const median = min === null ? "" : `, Median ${Math.floor(min / 60)} h ${min % 60} min`;
  const haengt = k.haengt_meist ? `, hängt meist bei: ${STATION_NAME[k.haengt_meist]}` : "";
  return `Ende-zu-Ende: ${k.live} von ${k.gesamt} live${median}${haengt}`;
}

/** Kanarienlauf nur, wenn in 7 Tagen kein Issue alle Stationen schaffte und kein Kanarien-Issue offen ist. */
export function kanarieNoetig(k: E2eKennzahl, issues: readonly StreckeIssue[]): boolean {
  return k.live === 0 && !issues.some((i) => i.offen && i.labels?.includes(KANARIE_LABEL));
}
