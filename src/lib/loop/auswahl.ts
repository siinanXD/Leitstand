/**
 * Loop des Leitstands (SIN-413): reine Funktionen für Dispatcher, Reparatur und Linear-Abgleich.
 * Kein Netz hier. Die Skripte unter scripts/loop/ rufen GitHub und Linear und geben die Daten hier hinein.
 */

export const PROJEKT = "Leitstand";
export const LABEL = "claude";
export const MAX_REPARATUR = 3;
/** Ab hier gilt ein Issue „In Progress“ ohne offenen PR als Hänger (gleiche Grenze wie der Wächter, SIN-419). */
export const HAENGER_STUNDEN = 6;

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
export type OffenerPr = { titel: string; branch: string };
/** Ohne Angabe zählt jedes laufende Issue (altes Verhalten). */
export type Belegung = { jetzt: Date; offenePrs: OffenerPr[] };

const ERLEDIGT = new Set(["completed", "canceled"]);

/** Erste Linear-Kennung im Text, z. B. aus einem PR-Titel. */
export function linearId(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(/\bSIN-\d+\b/);
  return m ? m[0] : null;
}

/** Markierung im GitHub-Issue, damit ein Linear-Issue nie zweimal gespiegelt wird. */
export const marker = (identifier: string) => `<!-- linear:${identifier} -->`;

export function gespiegelteIds(githubIssues: GithubIssue[]): Set<string> {
  const ids = new Set<string>();
  for (const i of githubIssues) {
    const m = String(i.body ?? "").match(/<!-- linear:(SIN-\d+) -->/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

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
 * (SIN-654): ohne offenen PR und länger als HAENGER_STUNDEN gestartet, z. B. weil der Worker mit Blocker aufgab.
 * Sonst blockiert so ein Issue den einzigen Platz, bis der Wächter es zurücksetzt.
 */
export function laufende(issues: LinearIssue[], belegung?: Belegung): LinearIssue[] {
  return issues.filter((i) => {
    if (i.stateType !== "started" || !hatLabel(i)) return false;
    if (!belegung || !i.startedAt) return true;
    if (belegung.offenePrs.some((pr) => prGehoertZu(pr, i))) return true;
    return belegung.jetzt.getTime() - Date.parse(i.startedAt) <= HAENGER_STUNDEN * 3_600_000;
  });
}

const startbar = (i: LinearIssue, gespiegelt: Set<string>) =>
  i.stateType === "unstarted" && hatLabel(i) && !offenBlockiert(i) && !gespiegelt.has(i.identifier);

export function waehle(issues: LinearIssue[], gespiegelt: Set<string>, max: number, belegung?: Belegung): LinearIssue[] {
  const frei = Math.max(0, max - laufende(issues, belegung).length);
  return issues
    .filter((i) => startbar(i, gespiegelt))
    .sort((a, b) => rang(a.priority) - rang(b.priority) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, frei);
}

/** Labels, mit denen ein Backlog-Issue nie automatisch nachrückt (Design zuerst, Aufgabe für Sinan, Stopp). */
export const NIE_AUTOMATISCH = ["design", "sinan", "needs-human"];

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

/** Text des GitHub-Issues, das den Worker (claude.yml) startet. */
export function issueText(i: LinearIssue, hinweise = ""): { title: string; body: string } {
  const kurz = i.identifier.toLowerCase();
  return {
    title: `${i.identifier}: ${i.title}`,
    body: [
      marker(i.identifier),
      `Linear: ${i.url}`,
      "",
      (i.description ?? "").trim() || "(keine Beschreibung)",
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

/** Nächster Schritt der Reparatur nach rotem `build`: nächste Runde oder Stopp. */
export function reparatur(labels: string[]): { runde: number } | { stopp: true } {
  const runden = labels.map((l) => /^repair:(\d+)$/.exec(l)).filter(Boolean).map((m) => Number(m![1]));
  const bisher = runden.length ? Math.max(...runden) : 0;
  if (labels.includes("needs-human") || bisher >= MAX_REPARATUR) return { stopp: true };
  return { runde: bisher + 1 };
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
