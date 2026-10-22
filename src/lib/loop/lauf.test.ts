import assert from "node:assert/strict";
import { test } from "node:test";
import { artLabel, leseLauf, pruefeLauf, starteLaeufe, type LaufAuftrag } from "./lauf";
import { laufende, waehle, type LinearIssue } from "./auswahl";

const issue = (o: Partial<LinearIssue> & { identifier: string }): LinearIssue => ({
  id: o.identifier, title: "t", description: null, priority: 3, url: "", createdAt: "2026-10-01T00:00:00Z",
  labels: ["claude"], stateType: "unstarted", blockiertVon: [], ...o,
});
const block = (j: unknown) => `## Auftrag\n\n<!-- lauf: ${JSON.stringify(j)} -->`;
const publish = { repo: "siinanXD/Content-Agent-Lernapp", workflow: "content-publish.yml", inputs: { keyword: "Industriemechaniker", dry_run: "true" } };

/** Dispatcher mit Fake-`workflow_dispatch`: hält fest, was gestartet und was übersprungen wurde. */
async function dispatch(issues: LinearIssue[]) {
  const gestartet: { issue: string; auftrag: LaufAuftrag }[] = [];
  const uebersprungen: { issue: string; grund: string }[] = [];
  await starteLaeufe(issues, {
    starte: async (i, auftrag) => void gestartet.push({ issue: i.identifier, auftrag }),
    ueberspringe: async (i, grund) => void uebersprungen.push({ issue: i.identifier, grund }),
  });
  return { gestartet, uebersprungen };
}

test("Test: Planer-Klassifizierung mit 3 Fixture-Issues (Fix, Veröffentlichen, Freigabe) → `claude`, `lauf`, `sinan`", () => {
  assert.equal(artLabel("Fix in loadCourse: leerer Lernpfad bei fehlender Quelle"), "claude");
  assert.equal(artLabel("Industriemechaniker veröffentlichen (485 Einheiten)"), "lauf");
  assert.equal(artLabel("Freigabe risk:high für den Gate-PR"), "sinan");
  // Der Lauf-Block legt die Art fest, auch wenn der Titel nach Code klingt.
  assert.equal(artLabel("Richter über alle Fragen", block(publish)), "lauf");
});

test("Test: Dispatcher startet ein `lauf`-Issue nur mit Workflow aus der Erlaubt-Liste, kein Worker-Lauf", async () => {
  const ok = issue({ identifier: "SIN-1", labels: ["lauf"], description: block(publish) });
  const fremd = issue({ identifier: "SIN-7", labels: ["lauf"], description: block({ ...publish, workflow: "production-deploy.yml" }) });
  const scharf = issue({ identifier: "SIN-8", labels: ["lauf"], description: block({ ...publish, inputs: { keyword: "Industriemechaniker", dry_run: "false" } }) });
  const ohne = issue({ identifier: "SIN-9", labels: ["lauf"], description: "ohne Block" });
  const { gestartet, uebersprungen } = await dispatch([ok, fremd, scharf, ohne]);
  assert.deepEqual(gestartet, [{ issue: "SIN-1", auftrag: publish }]);
  assert.deepEqual(uebersprungen.map((u) => u.issue), ["SIN-7", "SIN-8", "SIN-9"]);
  assert.match(uebersprungen[0].grund, /Erlaubt-Liste/);
  assert.match(uebersprungen[1].grund, /dry_run=false/);
  assert.match(uebersprungen[2].grund, /kein gültiger Block/);
  assert.match(String(pruefeLauf(leseLauf(block({ repo: "siinanXD/Content-Agent-Lernapp", workflow: "run-task.yml", inputs: { task: "content-bereinigen", dry_run: "false" } })))), /nur mit dry_run=true/);
  assert.match(String(pruefeLauf(leseLauf(block({ ...publish, inputs: { keyword: "X; rm -rf", dry_run: "true" } })))), /keyword/);
  // Kein Worker: die Worker-Auswahl kennt nur `claude`, Lauf-Issues tauchen dort nie auf.
  assert.deepEqual(waehle([ok, fremd, scharf, ohne], new Set(), 2), []);
});

test("Test: Mit 2 laufenden Code-Workern startet der Dispatcher trotzdem ein freies `lauf`-Issue", async () => {
  const jetzt = new Date("2026-10-22T12:00:00Z");
  const w1 = issue({ identifier: "SIN-2", stateType: "started", startedAt: "2026-10-22T11:50:00Z" });
  const w2 = issue({ identifier: "SIN-3", stateType: "started", startedAt: "2026-10-22T11:55:00Z" });
  const lauf = issue({ identifier: "SIN-4", labels: ["lauf"], description: block(publish) });
  assert.equal(laufende([w1, w2, lauf], { jetzt, offenePrs: [] }).length, 2);
  assert.deepEqual((await dispatch([w1, w2, lauf])).gestartet.map((g) => g.issue), ["SIN-4"]);
});

test("Test: Wird ein blockierendes Code-Issue Done, startet das abhängige `lauf`-Issue im selben Dispatch", async () => {
  const offen = issue({ identifier: "SIN-5", labels: ["lauf"], description: block(publish), blockiertVon: [{ identifier: "SIN-6", stateType: "started" }] });
  const frei = { ...offen, blockiertVon: [{ identifier: "SIN-6", stateType: "completed" }] };
  assert.deepEqual(await dispatch([offen]), { gestartet: [], uebersprungen: [] });
  assert.deepEqual((await dispatch([frei])).gestartet.map((g) => g.issue), ["SIN-5"]);
});

test("Linear-Maskierung im Lauf-Block wird gelesen", () => {
  const maskiert = "<!-- lauf: {\"repo\": \"siinanXD/Leitstand\", \"workflow\": \"migrationen.yml\", \"inputs\": {\"dry\\_run\": \"true\"}} -->";
  assert.deepEqual(leseLauf(maskiert), { repo: "siinanXD/Leitstand", workflow: "migrationen.yml", inputs: { dry_run: "true" } });
  assert.equal(pruefeLauf(leseLauf(maskiert)), null);
});
