/**
 * Loop des Leitstands (SIN-413): reine Funktionen für Dispatcher, Reparatur und Linear-Abgleich.
 * Kein Netz hier. Die Skripte unter scripts/loop/ rufen GitHub und Linear und geben die Daten hier hinein.
 */

import { passend, stufe } from "../kontingent/prioritaet";
import { nurBelege } from "../belege/belege";
import { istTeil, leseHaken, type Entscheidung } from "./haken";

export const PROJEKT ="Leitstand";
export const LABEL = "claude";
/** Höchstens zwei erfolglose Reparaturrunden je Issue (SIN-840), für Dispatcher, repair.yml und Wächter gleich (SIN-832). */
export const MAX_REPARATUR = 2;

/** Worker-Branches, die der Reparaturweg betreut (SIN-854: auch Codex). */
export const istWorkerBranch = (ref: string) => /^(claude|codex)\//.test(ref);
/** Ab hier gilt ein Issue „In Progress“ ohne offenen PR als Hänger (gleiche Grenze wie der Wächter, SIN-419). */
export const HAENGER_STUNDEN = 6;
/** Ohne offenen PR belegt ein laufendes Issue den Platz höchstens so lange (SIN-759). */
export const PLATZ_MINUTEN = 90;

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  url: string;
  createdAt: string;
  labels: string[];
  stateType: string;
  /** Wann das Issue auf „In Progress“ ging (Linear `startedAt`). */
  startedAt?: string | null;
  /** Issues, die dieses Issue blockieren, mit ihrem Status-Typ. */
  blockiertVon: { identifier: string; stateType: string }[];
};

export type GithubIssue = { number: number; body: string | null; state: string };
/** Offener PR, nur Titel und Branch (zum Zuordnen zu einem Linear-Issue). */
export type OffenerPr = { titel: string; branch: string; labels?: string[] };

/** PR wartet nur noch auf Sinan (`risk:high` ohne `freigegeben`, SIN-678): der Worker ist fertig, der Platz wird frei. */
export const wartetAufSinan = (pr: OffenerPr) => !!pr.labels?.includes("risk:high") && !pr.labels.includes("freigegeben");
/** Ohne Angabe zählt jedes laufende Issue (altes Verhalten). `gemergt`: Kennungen mit gemergtem (vollem) PR (SIN-918). */
export type Belegung = { jetzt: Date; offenePrs: OffenerPr[]; teilGemergt?: string[]; gemergt?: string[] };

/** SIN-918: Haken, der erst nach dem Merge belegbar ist. Linear maskiert die Klammern als `\[`. */
export const nachAktivierung = (text: string) => /^\\?\[nach Aktivierung\\?\]/i.test(text.trim());

/**
 * SIN-918: PR gemergt, offen sind nur noch `[nach Aktivierung]`-Haken. Das Issue wartet auf den Live-Beleg, nicht auf einen Worker.
 * Auch ohne bekannten PR: Abgehakte Haken setzt nur der Merge (`setzeHaken`). Sonst startete ein „Part of“-PR oder ein PR
 * außerhalb der letzten 30 das Issue immer wieder, der Worker endete ohne PR und sein Claim sperrte die Steuerung.
 */
export function wartetAufLiveBeleg(i: Pick<LinearIssue, "identifier" | "description">, gemergt: readonly string[]): boolean {
  const haken = leseHaken(i.description);
  const offen = haken.filter((h) => !h.erledigt);
  if (!gemergt.includes(i.identifier) && !(offen.length && haken.some((h) => h.erledigt))) return false;
  return offen.every((h) => nachAktivierung(h.text));
}

/** SIN-918: Status nach dem Merge. Nur noch Live-Haken offen → „In Review“ (kein Neustart); andere offene Haken → „Todo“ für den Folge-Worker. */
export function statusNachMerge(e: Pick<Entscheidung, "status" | "offen">): "Done" | "needs-human" | "In Review" | "Todo" {
  if (e.status === "done") return "Done";
  if (e.status === "needs-human") return "needs-human";
  return e.offen.length && e.offen.every(nachAktivierung) ? "In Review" : "Todo";
}

const ERLEDIGT = new Set(["completed", "canceled"]);

/** Erste Linear-Kennung im Text, z. B. aus einem PR-Titel. */
export function linearId(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(/\bSIN-\d+\b/);
  return m ? m[0] : null;
}

/** Markierung im GitHub-Issue, damit ein Linear-Issue nie zweimal gespiegelt wird. */
export const marker = (identifier: string) => `<!-- linear:${identifier} -->`;

const MARKER_RE = /<!-- linear:(SIN-\d+) -->/;

/** Nur ein offener Spiegel blockiert; ein geschlossener lässt das Issue wieder starten (SIN-760). */
export function gespiegelteIds(githubIssues: GithubIssue[]): Set<string> {
  const ids = new Set<string>();
  for (const i of githubIssues) {
    const m = i.state === "open" ? String(i.body ?? "").match(MARKER_RE) : null;
    if (m) ids.add(m[1]);
  }
  return ids;
}

/** Nummern der offenen GitHub-Spiegel eines Linear-Issues. */
export const offeneSpiegel = (githubIssues: GithubIssue[], identifier: string): number[] =>
  githubIssues.filter((i) => i.state === "open" && i.body?.match(MARKER_RE)?.[1] === identifier).map((i) => i.number);

const hatLabel = (i: LinearIssue) => i.labels.some((l) => l.toLowerCase() === LABEL);
const offenBlockiert = (i: LinearIssue) => i.blockiertVon.some((b) => !ERLEDIGT.has(b.stateType));

/** Linear-Priorität: 1 dringend … 4 niedrig, 0 = keine (zuletzt). */
const rang = (p: number) => (p > 0 ? p : 5);

/**
 * Welche Issues jetzt gestartet werden: Todo, Label `claude`, nicht blockiert, noch nicht gespiegelt.
 * Laufende (In Progress mit Label `claude`) zählen gegen `max`.
 */
const prGehoertZu = (pr: OffenerPr, i: LinearIssue) =>
  pr.titel.includes(i.identifier) || pr.branch.toLowerCase().includes(i.identifier.toLowerCase());

/**
 * Laufende Issues, die einen Platz belegen: „In Progress“ mit Label `claude`. Mit `belegung` zählt ein Hänger nicht
 * (SIN-654): ohne offenen PR und länger als PLATZ_MINUTEN gestartet, z. B. weil der Worker mit Blocker aufgab.
 * Sonst blockiert so ein Issue den einzigen Platz, bis der Wächter es zurücksetzt.
 */
export function laufende(issues: LinearIssue[], belegung?: Belegung): LinearIssue[] {
  return issues.filter((i) => {
    if (i.stateType !== "started" || !hatLabel(i) || nurBelege(i.description)) return false;
    if (!belegung) return true;
    const eigene = belegung.offenePrs.filter((pr) => prGehoertZu(pr, i));
    if (eigene.length) return !eigene.every(wartetAufSinan);
    if (belegung.gemergt && wartetAufLiveBeleg(i, belegung.gemergt)) return false;
    // SIN-781: „Part of“-PR gemergt, Haken offen: das Issue wartet auf den Folge-Worker und belegt keinen Platz.
    // shortcut: gilt auch, wenn der Folge-Worker schon läuft, aber noch keinen PR hat; ausbauen, wenn das zu Doppelläufen führt.
    if (belegung.teilGemergt?.includes(i.identifier)) return false;
    // Ohne Startzeit (Linear liefert sie nicht immer) nie ewig belegen: sonst bleibt der Platz für immer zu.
    if (!i.startedAt) return false;
    return belegung.jetzt.getTime() - Date.parse(i.startedAt) <= PLATZ_MINUTEN * 60_000;
  });
}

/** SIN-923: Claims, deren offener PR nur noch auf Sinan wartet, belegen keinen Startplatz (die Dateien schützt der PR-Schutz weiter). */
export function claimsMitPlatz(claims: LinearIssue[], belegung: Belegung): LinearIssue[] {
  return claims.filter((i) => {
    // Ein Claim auf ein Issue, das nur noch auf den Live-Beleg wartet, hält keinen Platz und keinen Schreibbereich.
    if (wartetAufLiveBeleg(i, belegung.gemergt ?? [])) return false;
    const eigene = belegung.offenePrs.filter((pr) => prGehoertZu(pr, i));
    return !(eigene.length && eigene.every(wartetAufSinan));
  });
}

/** Issues „In Progress“ mit Label `claude`, deren Platz `laufende` freigegeben hat (für den Eintrag in loop_events). */
export function freigegebene(issues: LinearIssue[], belegung: Belegung): LinearIssue[] {
  const belegt = new Set(laufende(issues, belegung).map((i) => i.identifier));
  return issues.filter((i) => i.stateType === "started" && hatLabel(i) && !belegt.has(i.identifier));
}

// SIN-832: `needs-human` belegt nie einen Platz, sonst steht bei einem Platz die ganze Schlange.
// SIN-846: Sind nur noch Belege-Haken offen, gehört das Issue dem Prüfer (belege.yml), nicht dem Bau-Worker.
const startbar = (i: LinearIssue, gespiegelt: Set<string>) =>
  i.stateType === "unstarted" && hatLabel(i) && !nurBelege(i.description) && !offenBlockiert(i) && !gespiegelt.has(i.identifier) && !i.labels.includes("needs-human") && !i.labels.includes("kriterien-unklar");

/** Startbare Todo-Issues, genau wie `waehle` sie sieht (SIN-736): Dispatcher und `loop_snapshot.queue.startable` zählen damit dasselbe. */
export const startbare = (issues: LinearIssue[], gespiegelt: Set<string>): LinearIssue[] => issues.filter((i) => startbar(i, gespiegelt));

/** `rest`: geschätzter Claude-Rest in Prozent (SIN-633). Reihenfolge nach Stufe, dann Priorität; bei knappem Rest fällt weg, was nicht passt. */
export function waehle(issues: LinearIssue[], gespiegelt: Set<string>, max: number, belegung?: Belegung, rest: number | null = null): LinearIssue[] {
  const frei = Math.max(0, max - laufende(issues, belegung).length);
  const geordnet = startbare(issues, gespiegelt)
    .filter((i) => !(belegung?.gemergt && wartetAufLiveBeleg(i, belegung.gemergt)))
    .sort((a, b) => stufe(a.labels) - stufe(b.labels) || rang(a.priority) - rang(b.priority) || a.createdAt.localeCompare(b.createdAt));
  return passend(geordnet, rest).slice(0, frei);
}

/** Labels, mit denen ein Backlog-Issue nie automatisch nachrückt (Design zuerst, Aufgabe für Sinan, Stopp). */
export const NIE_AUTOMATISCH = ["design", "sinan", "needs-human", "kriterien-unklar"];

/**
 * Nachrücken (SIN-417): Ist kein Todo-Issue mit Label `claude` startbar und noch ein Platz frei, rückt das
 * wichtigste Backlog-Issue nach (höchste Priorität, dann ältestes). Nie mit Label aus NIE_AUTOMATISCH, nie blockiert.
 */
export function nachruecken(issues: LinearIssue[], gespiegelt: Set<string>, max: number, belegung?: Belegung): LinearIssue | null {
  if (laufende(issues, belegung).length >= max) return null;
  if (issues.some((i) => startbar(i, gespiegelt))) return null;
  const kandidaten = issues
    .filter((i) => i.stateType === "backlog" && !offenBlockiert(i))
    .filter((i) => !i.labels.some((l) => NIE_AUTOMATISCH.includes(l.toLowerCase())))
    .sort((a, b) => rang(a.priority) - rang(b.priority) || a.createdAt.localeCompare(b.createdAt));
  return kandidaten[0] ?? null;
}

/**
 * Text des GitHub-Issues, das den Worker (claude.yml) startet (SIN-911): GitHub ist öffentlich, deshalb nur Titel,
 * Linear-Link und Fertig-Haken. Den vollen Auftrag holt der Worker über die Linear-API.
 */
export function issueText(i: LinearIssue, hinweise = ""): { title: string; body: string } {
  const kurz = i.identifier.toLowerCase();
  const haken = leseHaken(i.description);
  return {
    title: `${i.identifier}: ${i.title}`,
    body: [
      marker(i.identifier),
      `Linear: ${i.url}`,
      "",
      `Der volle Auftrag steht nur in Linear. Lies ihn zuerst mit: npx tsx scripts/loop/auftrag.ts ${i.identifier}`,
      "",
      "## Fertig, wenn",
      ...(haken.length ? haken.map((h) => `- [${h.erledigt ? "x" : " "}] ${h.text}`) : ["(keine Haken)"]),
      "",
      "---",
      `Arbeite auf dem Branch \`claude/${kurz}\`. PR-Titel als Conventional Commit mit \`${i.identifier}\`, Commits mit \`Part of ${i.identifier}\`.`,
      "Lies zuerst AGENTS.md. Vor dem Push: npm ci, npm run typecheck, npm run lint, npm test.",
      ...(hinweise ? ["", hinweise] : []),
    ].join("\n"),
  };
}

/**
 * Grund für `dispatch uebersprungen`, wenn nichts startbar ist (SIN-654): belegte Plätze mit Kennungen,
 * sonst keine startbaren Todo-Issues. Nie leer.
 */
export function grundNichtsStartbar(issues: LinearIssue[], gespiegelt: Set<string>, max: number, belegung?: Belegung): string {
  const belegt = laufende(issues, belegung);
  if (belegt.length >= max) return `kein_platz: ${belegt.map((i) => i.identifier).join(", ")} läuft (max ${max})`;
  const wartend = issues.filter((i) => i.stateType === "unstarted" && hatLabel(i));
  if (!wartend.length) return "keine_todo: kein Todo-Issue mit Label claude und kein Backlog-Issue zum Nachrücken";
  return `keine_todo: ${wartend.length} Todo-Issue(s) mit Label claude, alle blockiert oder schon gespiegelt`;
}

/** Gemergte PRs (SIN-763), deren Linear-Issue noch „In Progress“ ist: In Produkt-Repos läuft kein loop-merge, der Dispatcher holt das nach. */
export function gemergteFuerLaufende(issues: LinearIssue[], prs: { nummer: number; titel: string; gemergt: boolean }[]): { identifier: string; pr: number }[] {
  return issues
    .filter((i) => i.stateType === "started")
    .flatMap((i) => {
      const pr = prs.find((p) => p.gemergt && linearId(p.titel) === i.identifier);
      return pr ? [{ identifier: i.identifier, pr: pr.nummer }] : [];
    });
}

/** Kennungen, deren jüngster gemergter PR ein „Part of“ ist (SIN-781). Neueste PRs zuerst. */
export function teilGemergte(prs: { titel: string; body?: string | null; gemergt: boolean }[]): string[] {
  const gesehen = new Set<string>();
  const teil: string[] = [];
  for (const p of prs) {
    const id = p.gemergt ? linearId(p.titel) : null;
    if (!id || gesehen.has(id)) continue;
    gesehen.add(id);
    if (istTeil(p.titel, p.body)) teil.push(id);
  }
  return teil;
}

/**
 * Nächster Schritt der Reparatur nach rotem `build`: nächste Runde oder Stopp.
 * `issueweit`: dauerhaft gezählte Runden des Issues (SIN-832, `leitstand_aufgaben.reparaturen`), gilt über PRs und Provider hinweg.
 */
export function reparatur(labels: string[], issueweit = 0): { runde: number } | { stopp: true } {
  const runden = labels.map((l) => /^repair:(\d+)$/.exec(l)).filter(Boolean).map((m) => Number(m![1]));
  const bisher = Math.max(0, ...runden, Number.isSafeInteger(issueweit) ? issueweit : 0);
  if (labels.includes("needs-human") || bisher >= MAX_REPARATUR) return { stopp: true };
  return { runde: bisher + 1 };
}

/**
 * SIN-925: Reparatur nach einem Prüfer-Fund. Nur bei `pruefer:offen` und ohne echtes Risiko (`pruefer:hoch`, `risk:high`):
 * Risiken entscheidet Sinan. Gleicher Zähler und gleiche Obergrenze wie bei rotem `build`.
 */
export function prueferReparatur(labels: string[], issueweit = 0): { runde: number } | { stopp: true } | { keine: string } {
  if (!labels.includes("pruefer:offen")) return { keine: "kein offener Prüfer-Fund" };
  if (labels.includes("pruefer:hoch") || labels.includes("risk:high")) return { keine: "echtes Risiko, keine automatische Reparatur" };
  return reparatur(labels, issueweit);
}

/** Linear-Rohdaten (GraphQL) in das schlanke Format. */
export function ausLinear(node: {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  priority?: number | null;
  url: string;
  createdAt: string;
  startedAt?: string | null;
  labels?: { nodes: { name: string }[] };
  state: { type: string };
  inverseRelations?: { nodes: { type: string; issue: { identifier: string; state: { type: string } } }[] };
}): LinearIssue {
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description ?? null,
    priority: node.priority ?? 0,
    url: node.url,
    createdAt: node.createdAt,
    startedAt: node.startedAt ?? null,
    labels: (node.labels?.nodes ?? []).map((l) => l.name),
    stateType: node.state.type,
    blockiertVon: (node.inverseRelations?.nodes ?? [])
      .filter((r) => r.type === "blocks")
      .map((r) => ({ identifier: r.issue.identifier, stateType: r.issue.state.type })),
  };
}
