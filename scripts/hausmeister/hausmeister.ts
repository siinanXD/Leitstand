/**
 * Hausmeister (SIN-551). Aufruf aus hausmeister.yml (.github/workflows/hausmeister.yml), montags:
 *
 *   npx tsx scripts/hausmeister/hausmeister.ts
 *
 * Sammelt Funde (knip, jscpd, Workflows ohne Lauf, Skripte ohne Aufrufer, Entscheidungen ohne Issue, LEHREN-Länge) und schreibt
 * sie nach docs/autonomy/HAUSMEISTER.md. Löscht nichts selbst: Löschungen macht der Folgeschritt im Workflow als ein PR.
 *
 * Env: GH_TOKEN (nur lesend, für `gh run list`), DRY_RUN=1 (nur Log, Datei nicht schreiben). Fehlt `gh`, bleibt die Workflow-Liste leer.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { entscheidungenOhneIssue, lehrenZuLang, listeMarkdown, skripteOhneAufrufer, workflowsOhneLauf, type Befund, type Datei } from "../../src/lib/hausmeister/hausmeister";

const AUSGABE = "docs/autonomy/HAUSMEISTER.md";
const lies = (pfad: string) => (existsSync(pfad) ? readFileSync(pfad, "utf8") : "");
const dateien = (ordner: string) => (existsSync(ordner) ? readdirSync(ordner, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => `${e.parentPath}/${e.name}`) : []);

function ausfuehren(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 50_000_000, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    // knip und jscpd enden bei Funden mit Exit-Code ≠ 0; die Ausgabe zählt trotzdem.
    return (e as { stdout?: string }).stdout ?? "";
  }
}

function knipFunde(): string[] {
  try {
    const { issues = [] } = JSON.parse(ausfuehren("npx", ["knip", "--reporter", "json", "--no-exit-code"])) as { issues?: Record<string, unknown>[] };
    return issues.flatMap((i) =>
      Object.entries(i)
        .filter(([k, v]) => k !== "file" && Array.isArray(v) && v.length > 0)
        .map(([k, v]) => `${i.file}: ${k} (${(v as { name?: string }[]).map((x) => x.name ?? "?").join(", ")})`),
    );
  } catch {
    return ["knip lieferte keine lesbare Ausgabe"];
  }
}

function dubletten(): number {
  ausfuehren("npx", ["--yes", "jscpd", "src", "scripts", "--silent", "--reporters", "json", "--output", "/tmp/jscpd"]);
  try {
    return (JSON.parse(readFileSync("/tmp/jscpd/jscpd-report.json", "utf8")) as { statistics: { total: { clones: number } } }).statistics.total.clones;
  } catch {
    return 0;
  }
}

function workflowListe() {
  return readdirSync(".github/workflows")
    .filter((n) => n.endsWith(".yml"))
    .map((name) => {
      const json = ausfuehren("gh", ["run", "list", "--workflow", name, "--limit", "1", "--json", "createdAt"]);
      let letzterLauf: string | null = null;
      try {
        letzterLauf = (JSON.parse(json) as { createdAt: string }[])[0]?.createdAt ?? null;
      } catch {}
      return { name, letzterLauf };
    });
}

const skripte = dateien("scripts").filter((p) => /\.(ts|mjs)$/.test(p));
const alle: Datei[] = [...skripte, ...dateien(".github"), ...dateien("docs"), "package.json"].map((name) => ({ name, text: lies(name) }));
const befund: Befund = {
  knip: knipFunde(),
  dubletten: dubletten(),
  workflows: workflowsOhneLauf(workflowListe(), new Date()),
  skripte: skripteOhneAufrufer(skripte, alle),
  entscheidungen: entscheidungenOhneIssue(readdirSync("docs/decisions")),
  lehrenZeilen: lehrenZuLang(lies("LEHREN.md")),
};
const md = listeMarkdown(befund, new Date().toISOString().slice(0, 10));
console.log(md);
if (process.env.DRY_RUN !== "1") writeFileSync(AUSGABE, md);
