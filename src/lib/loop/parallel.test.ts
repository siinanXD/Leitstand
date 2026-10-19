import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { maxParallel, parallelAuswahl } from "./parallel";
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
