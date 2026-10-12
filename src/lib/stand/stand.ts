/**
 * Stand-Agent (SIN-508): reine Prüfungen „was ist die Wahrheit wofür“, kein Netz.
 * scripts/stand/pruefen.ts liest Dateien und Dienste und ruft diese Funktionen auf.
 * Jede Prüfung liefert Befunde: ok (passt), veraltet (abhängige Stelle weicht ab), fehlt (Stelle oder Quelle fehlt).
 */

export type Status = "ok" | "veraltet" | "fehlt";
export type Thema = "design" | "datenbank" | "doku" | "content" | "linear" | "leitstand";

export type Befund = { thema: Thema; pruefung: string; status: Status; text: string; link?: string };

export type StandConfig = {
  projekt: string;
  repo: string;
  themen: { id: Thema; wahrheit: string; link?: string; abhaengig: string[] }[];
  design?: { datei: string; frames: Frame[]; agentsDatei: string };
  datenbank?: { migrationen: string };
  doku?: { dateien: string[]; codeVerzeichnisse: string[] };
  content?: { einheitenTabelle: string; mapsTabelle: string; dateien: string; landkarte: string };
  leitstand?: { projekte: string[]; schritte: string[] };
};

/** Label für ein Issue, wenn der Agent die Abweichung nicht selbst behebt (SIN-508, Punkt 4). */
export const ISSUE_LABEL: Partial<Record<Thema, string>> = { design: "design", datenbank: "sinan" };

const ok = (thema: Thema, pruefung: string, text: string): Befund => ({ thema, pruefung, status: "ok", text });
const befund = (thema: Thema, pruefung: string, status: Status, text: string, link?: string): Befund => ({ thema, pruefung, status, text, link });

// ------------------------------------------------------------------ Design

export type Frame = { seite: string; id: string; pfad: string };

/**
 * Figma-Frames je Seite ↔ Liste in AGENTS.md ↔ Seiten im Code.
 * `figmaIds` (optional): IDs, die es in Figma wirklich gibt; ohne Angabe wird Figma nicht geprüft.
 * `seitenImCode`: Pfade der page.tsx, z. B. „src/app/ablauf/page.tsx“.
 */
export function pruefeDesign(frames: Frame[], agentsMd: string, seitenImCode: string[], figmaLink: string, figmaIds?: Set<string>): Befund[] {
  const out: Befund[] = [];
  for (const f of frames) {
    const name = `Frame ${f.id} (${f.seite})`;
    if (!agentsMd.includes(f.id)) out.push(befund("design", "agents-liste", "veraltet", `${name} steht nicht in der Frame-Liste von AGENTS.md.`, figmaLink));
    else out.push(ok("design", "agents-liste", `${name} steht in AGENTS.md.`));
    if (f.pfad && !seitenImCode.includes(f.pfad)) out.push(befund("design", "seite-im-code", "fehlt", `${name}: Seite ${f.pfad} fehlt im Code.`));
    if (figmaIds && !figmaIds.has(f.id)) out.push(befund("design", "frame-in-figma", "veraltet", `${name} gibt es in Figma nicht mehr.`, figmaLink));
  }
  const bekannt = new Set(frames.map((f) => f.pfad));
  for (const s of seitenImCode) {
    if (/\/(anmelden|auth|api)\//.test(s) || s === "src/app/page.tsx") continue;
    if (!bekannt.has(s)) out.push(befund("design", "frame-fuer-seite", "fehlt", `Seite ${s} hat keinen Frame in docs/stand.json.`, figmaLink));
  }
  return out;
}

// -------------------------------------------------------------- Datenbank

/** Migrationsversion = Ziffern vor dem ersten „_“ im Dateinamen. */
export const migrationsVersion = (datei: string) => /^(\d+)_/.exec(datei.split("/").pop() ?? "")?.[1] ?? null;

/** Migrationen im Repo ↔ supabase_migrations.schema_migrations. `angewendet` null = Datenbank nicht gelesen. */
export function pruefeMigrationen(dateien: string[], angewendet: string[] | null, link?: string): Befund[] {
  if (angewendet === null) return [befund("datenbank", "migrationen", "fehlt", "schema_migrations nicht gelesen (SUPABASE_ACCESS_TOKEN oder SUPABASE_PROJECT_REF fehlt).", link)];
  const imRepo = new Set(dateien.map(migrationsVersion).filter((v): v is string => v !== null));
  const inDb = new Set(angewendet);
  const wartend = [...imRepo].filter((v) => !inDb.has(v)).sort();
  const fehlend = [...inDb].filter((v) => !imRepo.has(v)).sort();
  const out: Befund[] = [];
  if (wartend.length) out.push(befund("datenbank", "migrationen-wartend", "veraltet", `Wartende Migrationen (im Repo, nicht in der Datenbank): ${wartend.join(", ")}.`, link));
  if (fehlend.length) out.push(befund("datenbank", "migrationen-fehlend", "fehlt", `In der Datenbank, aber nicht im Repo: ${fehlend.join(", ")}.`, link));
  if (!out.length) out.push(ok("datenbank", "migrationen", `${imRepo.size} Migrationen stimmen überein.`));
  return out;
}

// ------------------------------------------------------------------- Doku

/** Umgebungsvariablen aus Quelltext (`process.env.NAME` und `env.NAME`). */
export function envVariablen(code: string): string[] {
  const namen = new Set<string>();
  for (const m of code.matchAll(/\b(?:process\.env|env)\.([A-Z][A-Z0-9_]+)/g)) namen.add(m[1]);
  return [...namen].sort();
}

/** Variablen der Laufzeit oder des Workflows; sie stehen nie in .env.example. */
const SYSTEM_ENV = new Set(["NODE_ENV", "CI", "DRY_RUN", "GH_TOKEN", "GITHUB_RUN_ID", "GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "VERCEL_URL", "VERCEL_ENV"]);

/** Befehle (package.json scripts) und Umgebungsvariablen im Code ↔ README.md, .env.example, docs/LANDKARTE.md. */
export function pruefeDoku(skripte: string[], readme: string, envImCode: string[], envExample: string, landkarte: string | null): Befund[] {
  const out: Befund[] = [];
  const genannt = (s: string) => readme.includes(`npm run ${s}`) || ((s === "test" || s === "start") && readme.includes(`npm ${s}`));
  const ohneBefehl = skripte.filter((s) => !genannt(s));
  if (ohneBefehl.length) out.push(befund("doku", "befehle-readme", "veraltet", `README.md nennt diese Befehle nicht: ${ohneBefehl.join(", ")}.`));
  else out.push(ok("doku", "befehle-readme", "Alle Befehle stehen in README.md."));
  const ohneEintrag = envImCode.filter((v) => !SYSTEM_ENV.has(v) && !envExample.includes(v));
  if (ohneEintrag.length) out.push(befund("doku", "env-example", "fehlt", `Nicht in .env.example (nur Namen): ${ohneEintrag.join(", ")}.`));
  else out.push(ok("doku", "env-example", "Alle Umgebungsvariablen aus dem Code stehen in .env.example."));
  if (landkarte === null) out.push(befund("doku", "landkarte", "fehlt", "docs/LANDKARTE.md fehlt."));
  else {
    const ohneKarte = ohneEintrag.length === 0 ? envImCode.filter((v) => !SYSTEM_ENV.has(v) && !landkarte.includes(v)) : [];
    if (ohneKarte.length) out.push(befund("doku", "landkarte", "veraltet", `docs/LANDKARTE.md nennt nicht: ${ohneKarte.join(", ")}.`));
    else out.push(ok("doku", "landkarte", "docs/LANDKARTE.md ist vorhanden und vollständig."));
  }
  return out;
}

// ---------------------------------------------------------------- Content

export type MapZeile = { name: string; status: string };

/**
 * Maps-Status und Einheitenzahl in der Datenbank ↔ docs/content/*.json ↔ Content-Landkarte (Figma).
 * `landkarteEinheiten` null = Zahl nicht gelesen.
 */
export function pruefeContent(
  db: { einheiten: number; maps: MapZeile[] },
  dateiEinheiten: number,
  landkarteEinheiten: number | null,
  landkarteMaps: MapZeile[],
  link?: string,
): Befund[] {
  const out: Befund[] = [];
  if (db.einheiten !== dateiEinheiten) out.push(befund("content", "einheiten-dateien", "veraltet", `Datenbank zählt ${db.einheiten} Einheiten, docs/content/*.json ${dateiEinheiten}.`));
  else out.push(ok("content", "einheiten-dateien", `${db.einheiten} Einheiten in Datenbank und Dateien.`));
  if (landkarteEinheiten === null) out.push(befund("content", "einheiten-landkarte", "fehlt", "Zahl der Content-Landkarte nicht gelesen.", link));
  else if (landkarteEinheiten !== db.einheiten) out.push(befund("content", "einheiten-landkarte", "veraltet", `Content-Landkarte zeigt ${landkarteEinheiten} statt ${db.einheiten} Einheiten.`, link));
  else out.push(ok("content", "einheiten-landkarte", "Content-Landkarte zeigt die richtige Zahl."));
  for (const m of db.maps) {
    const k = landkarteMaps.find((x) => x.name === m.name);
    if (!k) out.push(befund("content", "map-status", "fehlt", `Map „${m.name}“ fehlt in der Content-Landkarte.`, link));
    else if (k.status.toLowerCase() !== m.status.toLowerCase()) out.push(befund("content", "map-status", "veraltet", `Map „${m.name}“: Landkarte „${k.status}“, Datenbank „${m.status}“.`, link));
  }
  return out;
}

// ----------------------------------------------------------- Linear ↔ GitHub

export type PrZeile = { nummer: number; titel: string; gemergt: boolean; url: string };
export type IssueZeile = { id: string; statusTyp: string; url?: string };

export const issueIds = (titel: string) => [...new Set(titel.match(/\bSIN-\d+\b/g) ?? [])];
/** Titel wie `Revert "feat(x): … (SIN-1)"`. */
export const istRevert = (titel: string) => /^revert\b/i.test(titel.trim());

/**
 * Gemergte PRs ↔ Issue-Status. Ein gemergter PR braucht ein Issue in „completed“; wurde er zuletzt
 * zurückgenommen (gemergter Revert-PR mit gleicher ID), darf das Issue nicht „completed“ sein.
 * `prs` in zeitlicher Reihenfolge, älteste zuerst.
 */
export function pruefeLinearGithub(prs: PrZeile[], issues: IssueZeile[]): Befund[] {
  const status = new Map(issues.map((i) => [i.id, i]));
  const zuletzt = new Map<string, PrZeile>();
  for (const pr of prs) {
    if (!pr.gemergt) continue;
    for (const id of issueIds(pr.titel)) zuletzt.set(id, pr);
  }
  const out: Befund[] = [];
  for (const [id, pr] of zuletzt) {
    const issue = status.get(id);
    if (!issue) continue;
    const done = issue.statusTyp === "completed";
    if (istRevert(pr.titel) && done) out.push(befund("linear", "revert-status", "veraltet", `${id} ist „Done“, aber PR #${pr.nummer} hat die Änderung zurückgenommen.`, issue.url ?? pr.url));
    else if (!istRevert(pr.titel) && !done) out.push(befund("linear", "merge-status", "veraltet", `${id} ist nicht „Done“, obwohl PR #${pr.nummer} gemergt ist.`, issue.url ?? pr.url));
  }
  if (!out.length) out.push(ok("linear", "merge-status", "Issue-Status passt zu den gemergten PRs."));
  return out;
}

// ----------------------------------------------------------------- Leitstand

/** Projekt- und Schrittnamen in loop_events müssen bekannt sein, sonst zeigt der Leitstand sie falsch oder gar nicht. */
export function pruefeLoopEvents(events: { project: string | null; step: string | null }[], projekte: string[], schritte: string[]): Befund[] {
  const p = new Set(projekte.map((x) => x.toLowerCase()));
  const s = new Set(schritte.map((x) => x.toUpperCase()));
  const unbekanntP = new Set<string>();
  const unbekanntS = new Set<string>();
  for (const e of events) {
    if (e.project && !p.has(e.project.toLowerCase())) unbekanntP.add(e.project);
    if (e.step && !s.has(e.step.toUpperCase())) unbekanntS.add(e.step);
  }
  const out: Befund[] = [];
  if (unbekanntP.size) out.push(befund("leitstand", "projekt-namen", "veraltet", `Unbekannte Projektnamen in loop_events: ${[...unbekanntP].sort().join(", ")}.`));
  if (unbekanntS.size) out.push(befund("leitstand", "schritt-namen", "veraltet", `Unbekannte Schrittnamen in loop_events: ${[...unbekanntS].sort().join(", ")}.`));
  if (!out.length) out.push(ok("leitstand", "namen", "Alle Projekt- und Schrittnamen sind bekannt."));
  return out;
}

// ------------------------------------------------------------------- Bericht

export type Bericht = {
  projekt: string;
  erzeugt: string;
  zusammenfassung: Record<Status, number>;
  abweichung: boolean;
  befunde: Befund[];
};

export function bericht(projekt: string, befunde: Befund[], jetzt: Date): Bericht {
  const z: Record<Status, number> = { ok: 0, veraltet: 0, fehlt: 0 };
  for (const b of befunde) z[b.status]++;
  return { projekt, erzeugt: jetzt.toISOString(), zusammenfassung: z, abweichung: z.veraltet + z.fehlt > 0, befunde };
}

/** Umgang mit einer Abweichung: Issue mit Label (Design, Datenbank) oder selbst per PR (Doku, Zahlen, Status). */
export function umgang(b: Befund): { art: "issue"; label: string } | { art: "pr" } | null {
  if (b.status === "ok") return null;
  const label = ISSUE_LABEL[b.thema];
  return label ? { art: "issue", label } : { art: "pr" };
}

/** Zeile für `loop_events` (Agent betrieb, Schritt stand); needs_human nur bei Abweichung. */
export function ereignisZeile(b: Bericht, runId: string | null, runUrl: string | null) {
  return { project: b.projekt, agent: "betrieb", step: "stand", status: b.abweichung ? "needs_human" : "ok", issue: null, pr: null, run_id: runId, run_url: runUrl };
}
