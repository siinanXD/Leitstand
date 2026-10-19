import assert from "node:assert/strict";
import { test } from "node:test";
import { codexKontingent, kontingentText } from "./codex-kontingent";

const jetzt = new Date("2026-10-19T18:00:00Z");

test("ohne oder mit ungültigem Zeitstempel ist Codex frei", () => {
  assert.equal(codexKontingent(null, jetzt).frei, true);
  assert.equal(codexKontingent("kaputt", jetzt).frei, true);
});

test("leer seit 16:30: nach 5 h wieder frei, vorher nicht", () => {
  const k = codexKontingent("2026-10-19T16:30:00Z", jetzt);
  assert.equal(k.frei, false);
  assert.equal(kontingentText(k), "Kontingent: leer seit 16:30");
  assert.equal(codexKontingent("2026-10-19T13:00:00Z", jetzt).frei, true);
  assert.equal(kontingentText(codexKontingent(null, jetzt)), "Kontingent: frei");
});
