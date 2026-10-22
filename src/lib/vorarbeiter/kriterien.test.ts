import assert from "node:assert/strict";
import { test } from "node:test";
import { startbare, type LinearIssue } from "../loop/auswahl";
import { kriterienPlan, pruefeKriterien } from "./kriterien";

test("Haken „Lauf-Link nach dem Merge“ ohne Marker → wird [nach Aktivierung]", () => {
  const p = pruefeKriterien("## Fertig, wenn\n- [ ] Probe in docs/abnahme.yml\n- [ ] Lauf-Link nach dem Merge\n");
  assert.ok(p.beschreibung.includes("- [ ] [nach Aktivierung] Lauf-Link nach dem Merge"));
  assert.deepEqual(p.ergaenzt, ["Lauf-Link nach dem Merge"]);
  assert.equal(p.unklar, false);
});

test("Haken „Test: X → Y“ → Testname „Test: X → Y“ im Block", () => {
  const p = pruefeKriterien("- [ ] Test: X → Y\n");
  assert.deepEqual(p.testnamen, ["Test: X → Y"]);
  assert.ok(p.beschreibung.includes('<!-- testnamen: ["Test: X → Y"] -->'));
  assert.equal(pruefeKriterien(p.beschreibung).beschreibung, p.beschreibung);
});

test("Issue ohne prüfbaren Haken → kriterien-unklar, nicht startbar", () => {
  assert.equal(pruefeKriterien("- [ ] Sieht gut aus\n").unklar, true);
  assert.equal(pruefeKriterien("Kein Haken").unklar, true);
  assert.equal(pruefeKriterien("- [ ] [nach Aktivierung] Zählung\n").unklar, true);
  const issue = { identifier: "SIN-1", stateType: "unstarted", labels: ["claude", "kriterien-unklar"], description: "- [ ] Test: a", blockiertVon: [], priority: 0, createdAt: "" } as unknown as LinearIssue;
  assert.deepEqual(startbare([issue], new Set()), []);
  assert.equal(startbare([{ ...issue, labels: ["claude"] }], new Set()).length, 1);
});

test("Dispatcher-Plan: Text ergänzen, unklare Todo-Issues markieren, markierte und laufende auslassen", () => {
  const basis = { stateType: "unstarted", labels: ["claude"] };
  const plan = kriterienPlan([
    { ...basis, identifier: "SIN-1", description: "- [ ] Sieht gut aus" },
    { ...basis, identifier: "SIN-2", description: "- [ ] Probe in docs/abnahme.yml\n- [ ] Lauf-Link nach dem Merge" },
    { ...basis, identifier: "SIN-3", description: "- [ ] Probe in docs/abnahme.yml" },
    { ...basis, identifier: "SIN-4", description: "Kein Haken", labels: ["claude", "kriterien-unklar"] },
    { ...basis, identifier: "SIN-5", description: "Kein Haken", stateType: "started" },
    { ...basis, identifier: "SIN-6", description: "Kein Haken", labels: ["sinan"] },
  ]);
  assert.deepEqual(plan.map((a) => [a.identifier, a.label, a.beschreibung !== null]), [["SIN-1", true, false], ["SIN-2", false, true]]);
  assert.ok(plan[1]!.beschreibung!.includes("[nach Aktivierung] Lauf-Link nach dem Merge"));
});

test("Linear-Maskierung: `\\[nach Aktivierung\\]` zählt als Marker, kein zweiter davor, kein Neuschreiben bei jedem Dispatch", () => {
  const linear = "## Fertig, wenn\n\n- [ ] Test: A → B\n- [ ] \\[nach Aktivierung\\] Zählung aus `loop_events`\n\n<!-- testnamen: \\[\"Test: A → B\"\\] -->\n";
  const p = pruefeKriterien(linear);
  assert.deepEqual(p.ergaenzt, []);
  assert.equal((p.beschreibung.match(/nach Aktivierung/g) ?? []).length, 1);
  assert.deepEqual(kriterienPlan([{ identifier: "SIN-1", description: linear, stateType: "unstarted", labels: ["claude"] }]), []);
});

test("Mehrfach-Marker aus dem alten Fehler werden auf einen zurückgeführt", () => {
  const kaputt = "- [ ] Test: A\n- [ ] \\[nach Aktivierung\\] \\[nach Aktivierung\\] \\[nach Aktivierung\\] 1 Woche lang 0 Läufe\n";
  const p = pruefeKriterien(kaputt);
  assert.match(p.beschreibung, /- \[ \] \[nach Aktivierung\] 1 Woche lang 0 Läufe/);
  assert.equal((p.beschreibung.match(/nach Aktivierung/g) ?? []).length, 1);
  assert.equal(kriterienPlan([{ identifier: "SIN-2", description: kaputt, stateType: "unstarted", labels: ["claude"] }]).length, 1);
});
