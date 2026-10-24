// E2E-Strecke (SIN-1073): Stationen je Issue von Todo bis Linear Done und Kennzahlen daraus. Rein, ohne Netz.
// Eine fehlende Station ist die Hänge-Station; es wird nichts geschätzt oder aufgefüllt.

export const STATIONEN = ["todo", "worker", "pr", "pruefer", "merge", "deploy", "abnahme", "done"] as const;
export type Station = (typeof STATIONEN)[number];
export type Zeiten = Record<Station, string | null>;

export const FENSTER_TAGE = 7;
export const MAX_ISSUES_JE_SEITE = 50;
export const MAX_HISTORY = 20;

export type Ereignis = { created_at: string; step: string | null; status: string | null; issue: string | null; pr: number | null };
export type Kommentar = { body: string; createdAt: string };
export type Vercelstatus = { context: string; description: string | null; created_at: string };
export type PrEingabe = { nummer: number; erstelltAm: string; mergedAm: string | null; kommentare: readonly Kommentar[]; deploys: readonly Vercelstatus[] };
export type IssueEingabe = { kennung: string; todoAm: string | null; doneAm: string | null; ereignisse: readonly Ereignis[]; pr: PrEingabe | null };
export type IssueStrecke = { kennung: string; zeiten: Zeiten; haengtBei: Station | null };
export type E2eKennzahlen = {
  fenster_tage: number;
  issues: number;
  vollstaendig: number;
  anteil: number | null;
  median_todo_bis_live_min: number | null;
  haeufigste_haenge_station: Station | null;
  haengt: { kennung: string; station: Station }[];
};

const ms = (iso: string) => Date.parse(iso);
const frueheste = (zeiten: readonly string[]): string | null => (zeiten.length ? zeiten.reduce((a, b) => (ms(b) < ms(a) ? b : a)) : null);

/** Bestanden-Kommentar des Prüfers mit Stand-Marker (wie leseStand in scripts/loop/beleg-stand.mjs). */
export function prueferBestanden(k: Kommentar): boolean {
  return (
    k.body.startsWith("<!-- pruefer-zweites-modell -->\n") &&
    /<!-- pruefer-stand:[0-9a-f]{40}:[0-9a-f]{16} -->/.test(k.body) &&
    /^### Prüfer \(zweites Modell\): bestanden\r?$/m.test(k.body)
  );
}

/** Fertiger Produktions-Deploy: Vercel-Status „Deployment has completed“. */
export function deployFertig(s: Vercelstatus): boolean {
  return s.context === "Vercel" && s.description === "Deployment has completed";
}

export function stationen(i: IssueEingabe): IssueStrecke {
  const eigene = i.ereignisse.filter((e) => e.issue === i.kennung);
  const zeiten = Object.fromEntries(STATIONEN.map((s) => [s, null])) as Zeiten;
  zeiten.todo = i.todoAm;
  zeiten.worker = frueheste(eigene.filter((e) => e.step === "worker" && e.status === "start").map((e) => e.created_at));
  zeiten.pr = i.pr?.erstelltAm ?? null;
  zeiten.pruefer = i.pr ? frueheste(i.pr.kommentare.filter(prueferBestanden).map((k) => k.createdAt)) : null;
  zeiten.merge = i.pr?.mergedAm ?? null;
  zeiten.deploy = i.pr && zeiten.merge ? frueheste(i.pr.deploys.filter(deployFertig).map((d) => d.created_at)) : null;
  // Probe erst nach dem Deploy, sonst belegt sie nicht den Stand dieses Merges.
  const nachDeploy = zeiten.deploy;
  zeiten.abnahme = nachDeploy ? frueheste(eigene.filter((e) => e.step === "abnahme" && e.status === "ok" && ms(e.created_at) > ms(nachDeploy)).map((e) => e.created_at)) : null;
  zeiten.done = i.doneAm;
  return { kennung: i.kennung, zeiten, haengtBei: STATIONEN.find((s) => zeiten[s] === null) ?? null };
}

function median(werte: number[]): number | null {
  if (werte.length === 0) return null;
  const w = [...werte].sort((a, b) => a - b);
  const m = Math.floor(w.length / 2);
  return w.length % 2 ? w[m] : (w[m - 1] + w[m]) / 2;
}

/** Issues mit Todo-Zeit in den letzten 7 Tagen; ohne bekannte Todo-Zeit zählt „todo“ als Hänge-Station. */
export function kennzahlen(issues: readonly IssueEingabe[], jetzt: Date): E2eKennzahlen {
  const ab = jetzt.getTime() - FENSTER_TAGE * 86_400_000;
  const strecken = issues.filter((i) => !i.todoAm || ms(i.todoAm) >= ab).map(stationen);
  const fertig = strecken.filter((s) => s.haengtBei === null);
  const haengt = strecken.flatMap((s) => (s.haengtBei ? [{ kennung: s.kennung, station: s.haengtBei }] : []));
  const zaehler = new Map<Station, number>();
  for (const h of haengt) zaehler.set(h.station, (zaehler.get(h.station) ?? 0) + 1);
  // Bei Gleichstand gewinnt die frühere Station.
  const haeufigste = STATIONEN.reduce<Station | null>((best, s) => ((zaehler.get(s) ?? 0) > (best ? zaehler.get(best)! : 0) ? s : best), null);
  // Live = Abnahme-Probe grün.
  const dauern = fertig.map((s) => (ms(s.zeiten.abnahme!) - ms(s.zeiten.todo!)) / 60_000);
  return {
    fenster_tage: FENSTER_TAGE,
    issues: strecken.length,
    vollstaendig: fertig.length,
    anteil: strecken.length ? fertig.length / strecken.length : null,
    median_todo_bis_live_min: median(dauern),
    haeufigste_haenge_station: haeufigste,
    haengt,
  };
}

/** Linear-Anfrage: höchstens 50 Issues je Seite, je Issue höchstens 20 History-Einträge (sonst Komplexitätslimit). */
export function linearAbfrage(ab: string, nach: string | null) {
  return {
    query: `query($ab: DateTimeOrDuration!, $nach: String) { issues(first: ${MAX_ISSUES_JE_SEITE}, after: $nach, filter: { project: { name: { eq: "Leitstand" } }, updatedAt: { gte: $ab } }, orderBy: updatedAt) {
  nodes { identifier createdAt completedAt attachments { nodes { url } } history(first: ${MAX_HISTORY}) { nodes { createdAt toState { name } } } } pageInfo { hasNextPage endCursor } } }`,
    variables: { ab, nach },
  };
}
