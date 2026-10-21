import assert from "node:assert/strict";
import { test } from "node:test";
import { startbare, type LinearIssue } from "../loop/auswahl";
import { pruefeKriterien } from "./kriterien";

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
