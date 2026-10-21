import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { konflikt, ladePrSchutz, maxParallel, parallelAuswahl, schreibPfade, schuetztNoch, vorschlagPfade } from "./parallel";
import { pfadeFuer, planeVorhaben } from "./bereich";
import type { LinearIssue } from "./auswahl";

const issue = (id: string, paths?: string[]): LinearIssue => ({
  id, identifier: id, title: id, description: paths ? `<!-- worker-pfade: ${JSON.stringify(paths)} -->` : null,
  priority: 3, url: "", createdAt: "", labels: ["claude"], stateType: "unstarted", blockiertVon: [],
});

test("SIN-856: nur Leitstand bekommt zwei Plätze, bestehende Produktlimits bleiben", () => {
  assert.equal(maxParallel("siinanXD/Leitstand", "1"), 2);
  assert.equal(maxParallel("siinanXD/Leitstand", "1", "1"), 1);
  assert.equal(maxParallel("siinanXD/Leitstand", "1", "9"), 2);
  assert.equal(maxParallel("siinanXD/stromlauf-ai", "1", "2"), 1);
  assert.equal(maxParallel("siinanXD/stromlauf-ai", "3"), 3);
  assert.equal(maxParallel("siinanXD/Leitstand", undefined, "kaputt"), 1);
});

test("SIN-856: getrennte Pfade parallel, gemeinsame Datei/Verzeichnis wartet", () => {
  const a = issue("A", ["src/app/a"]), b = issue("B", ["src/app/a/page.tsx"]), c = issue("C", ["src/app/c"]);
  assert.deepEqual(parallelAuswahl([a, b, c], [], 2).map(i => i.id), ["A", "C"]);
  assert.deepEqual(parallelAuswahl([b, c], [a], 2).map(i => i.id), ["C"]);
});

test("SIN-856: unklarer Scope bleibt allein, root-Dateien und Gate sind geschützt", () => {
  assert.deepEqual(parallelAuswahl([issue("A"), issue("B", ["src/app/b"])], [], 2).map(i => i.id), ["A"]);
  assert.deepEqual(parallelAuswahl([issue("B", ["src/app/b"])], [issue("A")], 2), []);
  const a = issue("A", ["AGENTS.md"]), b = issue("B", ["AGENTS.md"]);
  assert.deepEqual(parallelAuswahl([a, b], [], 2).map(i => i.id), ["A"]);
  assert.deepEqual(parallelAuswahl([issue("B", ["scripts/loop/loop.ts"])], [issue("A", [".github/workflows/dispatch.yml"])], 2), []);
});

test("SIN-856: ungültige Pfade und ungemergte PRs blockieren Überschneidungen", () => {
  const a = issue("A", ["../outside"]), b = issue("B", ["src/app/b"]);
  assert.deepEqual(parallelAuswahl([a, b], [], 2).map(i => i.id), ["A"]);
  assert.deepEqual(parallelAuswahl([b], [], 2, [b]), []);
  assert.deepEqual(parallelAuswahl([b], [], 2, [{ description: null }]), [], "nicht zugeordneter PR bleibt geschützt");
  assert.deepEqual(parallelAuswahl([a, b], [a, b], 2), []);
});


test("SIN-856: Worker konfiguriert genau einen lesenden Helfer ohne Rekursion", () => {
  const y = readFileSync(new URL("../../../.github/workflows/claude.yml", import.meta.url), "utf8");
  const agents = JSON.parse(y.match(/--agents '([^'\n]+)'/)![1]);
  assert.deepEqual(Object.keys(agents), ["lese-assistent"]);
  assert.deepEqual(agents["lese-assistent"].tools, ["Read", "Grep", "Glob"]);
  assert.equal(agents["lese-assistent"].model, "inherit");
  assert.equal(agents["lese-assistent"].maxTurns, 12);
  assert.match(y, /CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: "1"/);
  assert.match(y, /CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: "1"/);
  assert.match(y, /CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1"/);
});

test("SIN-856: PR-Schutz liest alle Seiten, alte Namen umbenannter Dateien und sperrt unlesbare Listen", async () => {
  const seiten: Record<number, { filename: string; previous_filename?: string }[][]> = {
    1: [Array.from({ length: 100 }, (_, n) => ({ filename: `docs/x${n}.md` })), [{ filename: "src/app/neu.tsx", previous_filename: "src/app/alt.tsx" }]],
    2: [[{ filename: "src/app/b/page.tsx" }]],
  };
  const [p1, p2, p3] = await ladePrSchutz([{ number: 1 }, { number: 2 }, { number: 3 }], async (pr, page) => {
    if (pr === 3) throw new Error("503");
    return seiten[pr][page - 1] ?? [];
  });
  assert.match(p1.description!, /src\/app\/alt\.tsx/, "alter Name bleibt geschützt");
  assert.match(p1.description!, /src\/app\/neu\.tsx/, "Seite 2 wird gelesen");
  assert.equal(p3.description, null);
  assert.deepEqual(parallelAuswahl([issue("A", ["src/app/alt.tsx"])], [], 2, [p1]), [], "Umbenennung sperrt den alten Pfad");
  assert.deepEqual(parallelAuswahl([issue("B", ["src/app/c"])], [], 2, [p2, p3]), [], "unlesbare Liste sperrt konservativ");
  assert.deepEqual(parallelAuswahl([issue("B", ["src/app/c"])], [], 2, [p2]).map(i => i.id), ["B"]);
});

test("SIN-856: gekürzte Dateiliste (30 volle Seiten) bleibt exklusiv", async () => {
  const [p] = await ladePrSchutz([{ number: 9 }], async () => Array.from({ length: 100 }, (_, n) => ({ filename: `docs/y${n}.md` })));
  assert.equal(p.description, null);
});

test("SIN-896: Planer zerlegt „Seite mit neuer API“ in schnittstelle → (frontend ∥ backend)", () => {
  const plan = planeVorhaben({ id: "SIN-900", titel: "Seite mit neuer API", modul: "kennzahl", frontend: true, backend: true });
  assert.deepEqual(plan.map(p => p.bereich), ["schnittstelle", "backend", "frontend"]);
  assert.deepEqual(plan.map(p => p.labels), [["claude", "schnittstelle"], ["claude", "backend"], ["claude", "frontend"]]);
  assert.deepEqual(plan.map(p => p.blockiertVon), [[], ["SIN-900-schnittstelle"], ["SIN-900-schnittstelle"]]);
  assert.ok(plan.every(p => p.pfade.length >= 3 && p.pfade.includes(`docs/abnahme/${p.schluessel}.yml`)));
  assert.deepEqual(plan[2].pfade.slice(0, 2), ["src/app/kennzahl", "src/components/kennzahl"]);
  assert.throws(() => pfadeFuer("backend", "../x", "SIN-1"));
});

test("SIN-896: frontend und backend mit eigenen Abnahme-Dateien starten im selben Dispatch", () => {
  const [, be, fe] = planeVorhaben({ id: "SIN-900", titel: "Seite", modul: "kennzahl", frontend: true, backend: true });
  const alsIssue = (p: typeof be): LinearIssue => ({ ...issue(p.schluessel, p.pfade), labels: p.labels });
  assert.deepEqual(parallelAuswahl([alsIssue(fe), alsIssue(be)], [], 2).map(i => i.id), ["SIN-900-frontend", "SIN-900-backend"]);
  assert.deepEqual(parallelAuswahl([alsIssue(fe), alsIssue({ ...be, labels: ["claude", "frontend"] })], [], 2).map(i => i.id), ["SIN-900-frontend"], "je Bereich ein Worker");
});

test("SIN-896: schreibPfade liest Linear-escapte Blöcke", () => {
  const roh = '<!-- worker-pfade: \\["src/lib/kennzahl\\_durchstich", "docs/abnahme/SIN-897.yml"\\] -->';
  assert.deepEqual(schreibPfade({ description: roh }), ["src/lib/kennzahl_durchstich", "docs/abnahme/SIN-897.yml"]);
});

test("SIN-896: echter Linear-API-Text von SIN-897 ergibt 4 Pfade", () => {
  const roh = '<!-- worker-pfade: \\["src/lib/kennzahlen", "scripts/kennzahlen", "src/app/(uebersicht)", "docs/decisions"\\] -->';
  assert.deepEqual(schreibPfade({ description: roh }), ["src/lib/kennzahlen", "scripts/kennzahlen", "src/app/(uebersicht)", "docs/decisions"]);
});

test("SIN-896: wartender risk:high-PR schützt seine Dateien höchstens 24 h", () => {
  const jetzt = new Date("2026-10-21T12:00:00Z");
  const hoch = { labels: ["risk:high"], createdAt: "2026-10-20T11:00:00Z" };
  assert.equal(schuetztNoch(hoch, jetzt), false);
  assert.equal(schuetztNoch({ ...hoch, createdAt: "2026-10-21T00:00:00Z" }, jetzt), true);
  assert.equal(schuetztNoch({ ...hoch, labels: ["risk:high", "freigegeben"] }, jetzt), true);
  assert.equal(schuetztNoch({ labels: ["risk:medium"], createdAt: "2026-10-01T00:00:00Z" }, jetzt), true);
});

test("Test: SIN-913-Pfade gegen SIN-897-Pfade (beide mit `docs/decisions/...`) → kein Konflikt", () => {
  const a = issue("SIN-913", ["src/lib/agent-testnutzer", "e2e", "docs/abnahme.yml", "docs/decisions/agent-testnutzer-leitstand.md"]);
  const b = issue("SIN-897", ["src/lib/kennzahlen", "scripts/kennzahlen", "src/app/(uebersicht)", "docs/decisions"]);
  assert.deepEqual(parallelAuswahl([a], [b], 2).map((i) => i.id), ["SIN-913"]);
  assert.equal(konflikt(schreibPfade(a), schreibPfade(b)), false);
});

test("Test: zwei Issues mit `.github/workflows/testnutzer.yml` bzw. `.github/workflows/crawler.yml` → kein Konflikt; eins mit `automerge.yml` + eins mit `dispatch.yml` → Konflikt", () => {
  const t = issue("A", [".github/workflows/testnutzer.yml"]), c = issue("B", [".github/workflows/crawler.yml"]);
  assert.deepEqual(parallelAuswahl([c], [t], 2).map((i) => i.id), ["B"]);
  const gate = issue("C", [".github/workflows/automerge.yml"]), disp = issue("D", [".github/workflows/dispatch.yml"]);
  assert.deepEqual(parallelAuswahl([disp], [gate], 2), []);
  // Pauschal „.github/workflows“ bleibt Steuerung.
  assert.deepEqual(parallelAuswahl([issue("E", [".github/workflows"])], [gate], 2), []);
});

test("Test: gleiche Produktdatei (`src/lib/x.ts`) → weiterhin Konflikt", () => {
  const a = issue("A", ["src/lib/x.ts", "docs/decisions/a.md"]), b = issue("B", ["src/lib/x.ts", "docs/decisions/b.md"]);
  assert.deepEqual(parallelAuswahl([b], [a], 2), []);
  assert.equal(konflikt([], ["src/lib/y.ts"]), true, "ohne Angabe bleibt exklusiv");
  assert.equal(konflikt(["docs/decisions/a.md"], ["docs/decisions/b.md"]), false, "nur Sammelpfade: parallel");
});

test("SIN-919: Pfad-Vorschlag aus Backticks, Unklares leer", () => {
  assert.deepEqual(vorschlagPfade("Fix in `scripts/loop/loop.ts` und `src/lib/pause.ts`, siehe `npm test`."), ["scripts/loop/loop.ts", "src/lib/pause.ts"]);
  assert.deepEqual(vorschlagPfade("Nur Text ohne Pfade"), []);
  assert.deepEqual(vorschlagPfade("`../geheim` und `/etc/passwd`"), []);
});
