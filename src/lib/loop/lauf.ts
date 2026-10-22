// Lauf-Spur (SIN-887): Issues mit Label `lauf` brauchen keinen Code, sondern einen Lauf eines vorhandenen Workflows
// (Trockenlauf, Richterlauf, Zählung). Der Dispatcher startet sie per `workflow_dispatch`, ohne Worker und ohne Worker-Platz.
// Nur aus der Erlaubt-Liste; schreibende Läufe mit Produktionswirkung (Veröffentlichen, Bereinigen) nur als Trockenlauf.

export const LAUF_LABEL = "lauf";

export type LaufAuftrag = { repo: string; workflow: string; inputs: Record<string, string> };

/** Je Workflow: welche Eingaben erlaubt sind und welche einen festen Wert haben müssen. */
type Regel = { repo: string; workflow: string; eingaben: Record<string, RegExp> };
export const ERLAUBT: Regel[] = [
  { repo: "siinanXD/Content-Agent-Lernapp", workflow: "content-publish.yml", eingaben: { keyword: /^[\p{L} /-]{3,40}$/u, dry_run: /^true$/ } },
  { repo: "siinanXD/Content-Agent-Lernapp", workflow: "run-task.yml", eingaben: { task: /^(judge-backfill|cost-report|goldset-indkfl|safety-sample|content-bereinigen)$/, kurs: /^[\p{L} /-]{0,40}$/u, dry_run: /^(true|false)$/ } },
  { repo: "siinanXD/Leitstand", workflow: "migrationen.yml", eingaben: { dry_run: /^true$/ } },
  { repo: "siinanXD/Leitstand", workflow: "abnahme.yml", eingaben: {} },
];

/** Pflicht-Eingaben, die immer gesetzt sein müssen (sonst würde der Workflow-Standard greifen). */
const PFLICHT: Record<string, string[]> = {
  "content-publish.yml": ["keyword", "dry_run"],
  "run-task.yml": ["task"],
  "migrationen.yml": ["dry_run"],
};

/** `content-bereinigen` schreibt in Produktion: über die Lauf-Spur nur als Trockenlauf. */
const NUR_TROCKEN = new Set(["content-bereinigen"]);

/** Block `<!-- lauf: {...} -->` aus der Issue-Beschreibung; Linear maskiert `[`, `]`, `_` mit `\`. */
export function leseLauf(beschreibung: string | null | undefined): LaufAuftrag | null {
  const m = String(beschreibung ?? "").replace(/\\([[\]_])/g, "$1").match(/<!-- lauf: (\{[^\n]*\}) -->/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]) as Partial<LaufAuftrag>;
    if (typeof j.repo !== "string" || typeof j.workflow !== "string") return null;
    const inputs = Object.fromEntries(Object.entries(j.inputs ?? {}).map(([k, v]) => [k, String(v)]));
    return { repo: j.repo, workflow: j.workflow, inputs };
  } catch {
    return null;
  }
}

/** Grund, warum der Lauf nicht startet, oder null, wenn er erlaubt ist. */
export function pruefeLauf(a: LaufAuftrag | null): string | null {
  if (!a) return "kein gültiger Block <!-- lauf: {\"repo\", \"workflow\", \"inputs\"} --> in der Beschreibung";
  const r = ERLAUBT.find((x) => x.repo.toLowerCase() === a.repo.toLowerCase() && x.workflow === a.workflow);
  if (!r) return `${a.repo}/${a.workflow} steht nicht auf der Erlaubt-Liste`;
  for (const [k, v] of Object.entries(a.inputs)) {
    if (!r.eingaben[k]) return `Eingabe ${k} ist für ${a.workflow} nicht erlaubt`;
    if (!r.eingaben[k].test(v)) return `Eingabe ${k}=${v} ist für ${a.workflow} nicht erlaubt`;
  }
  for (const k of PFLICHT[a.workflow] ?? []) if (!(k in a.inputs)) return `Eingabe ${k} fehlt`;
  if (NUR_TROCKEN.has(a.inputs.task ?? "") && a.inputs.dry_run !== "true") return `${a.inputs.task} über die Lauf-Spur nur mit dry_run=true`;
  return null;
}

type LaufIssue = { identifier: string; stateType: string; labels: string[]; blockiertVon: { stateType: string }[] };
const ERLEDIGT = new Set(["completed", "canceled"]);

/**
 * Startbare Lauf-Issues: Todo, Label `lauf`, kein offener Blocker. Belegen keinen Worker-Platz (eigene Spur), darum
 * unabhängig von laufenden Code-Workern. Wird ein blockierendes Code-Issue Done, ist das Lauf-Issue im selben Dispatch frei.
 */
export const laufKandidaten = <T extends LaufIssue>(issues: T[]): T[] =>
  issues.filter((i) => i.stateType === "unstarted" && i.labels.some((l) => l.toLowerCase() === LAUF_LABEL) && !i.blockiertVon.some((b) => !ERLEDIGT.has(b.stateType)));
