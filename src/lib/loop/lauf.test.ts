import assert from "node:assert/strict";
import { test } from "node:test";
import { laufKandidaten, leseLauf, pruefeLauf } from "./lauf";
import { laufende, waehle, type LinearIssue } from "./auswahl";

const issue = (o: Partial<LinearIssue> & { identifier: string }): LinearIssue => ({
  id: o.identifier, title: "t", description: null, priority: 3, url: "", createdAt: "2026-10-01T00:00:00Z",
  labels: ["claude"], stateType: "unstarted", blockiertVon: [], ...o,
});
const block = (j: unknown) => `## Auftrag\n\n<!-- lauf: ${JSON.stringify(j)} -->`;
const publish = { repo: "siinanXD/Content-Agent-Lernapp", workflow: "content-publish.yml", inputs: { keyword: "Industriemechaniker", dry_run: "true" } };

test("Test: Dispatcher startet ein `lauf`-Issue nur mit Workflow aus der Erlaubt-Liste, kein Worker-Lauf", () => {
  const ok = issue({ identifier: "SIN-1", labels: ["lauf"], description: block(publish) });
  assert.equal(pruefeLauf(leseLauf(ok.description)), null);
  assert.match(String(pruefeLauf(leseLauf(block({ ...publish, workflow: "production-deploy.yml" })))), /Erlaubt-Liste/);
  assert.match(String(pruefeLauf(leseLauf(block({ ...publish, inputs: { keyword: "Industriemechaniker", dry_run: "false" } })))), /dry_run=false/);
  assert.match(String(pruefeLauf(leseLauf(block({ repo: "siinanXD/Content-Agent-Lernapp", workflow: "run-task.yml", inputs: { task: "content-bereinigen", dry_run: "false" } })))), /nur mit dry_run=true/);
  assert.match(String(pruefeLauf(leseLauf(block({ ...publish, inputs: { keyword: "X; rm -rf", dry_run: "true" } })))), /keyword/);
  assert.match(String(pruefeLauf(leseLauf("ohne Block"))), /kein gültiger Block/);
  // Kein Worker: waehle() kennt nur `claude`, das Lauf-Issue taucht dort nie auf.
  assert.deepEqual(waehle([ok], new Set(), 2), []);
  assert.deepEqual(laufKandidaten([ok]).map((i) => i.identifier), ["SIN-1"]);
});

test("Test: Mit 2 laufenden Code-Workern startet der Dispatcher trotzdem ein freies `lauf`-Issue", () => {
  const jetzt = new Date("2026-10-22T12:00:00Z");
  const w1 = issue({ identifier: "SIN-2", stateType: "started", startedAt: "2026-10-22T11:50:00Z" });
  const w2 = issue({ identifier: "SIN-3", stateType: "started", startedAt: "2026-10-22T11:55:00Z" });
  const lauf = issue({ identifier: "SIN-4", labels: ["lauf"], description: block(publish) });
  assert.equal(laufende([w1, w2, lauf], { jetzt, offenePrs: [] }).length, 2);
  assert.deepEqual(laufKandidaten([w1, w2, lauf]).map((i) => i.identifier), ["SIN-4"]);
});

test("Test: Wird ein blockierendes Code-Issue Done, startet das abhängige `lauf`-Issue im selben Dispatch", () => {
  const offen = issue({ identifier: "SIN-5", labels: ["lauf"], blockiertVon: [{ identifier: "SIN-6", stateType: "started" }] });
  const frei = { ...offen, blockiertVon: [{ identifier: "SIN-6", stateType: "completed" }] };
  assert.deepEqual(laufKandidaten([offen]), []);
  assert.deepEqual(laufKandidaten([frei]).map((i) => i.identifier), ["SIN-5"]);
});

test("Linear-Maskierung im Lauf-Block wird gelesen", () => {
  const maskiert = "<!-- lauf: {\"repo\": \"siinanXD/Leitstand\", \"workflow\": \"migrationen.yml\", \"inputs\": {\"dry\\_run\": \"true\"}} -->";
  assert.deepEqual(leseLauf(maskiert), { repo: "siinanXD/Leitstand", workflow: "migrationen.yml", inputs: { dry_run: "true" } });
  assert.equal(pruefeLauf(leseLauf(maskiert)), null);
});
