import assert from "node:assert/strict";
import { test } from "node:test";
import { prueferLaufziel } from "./pruefer-lauf";

test("Test: `pruefer siinanXD/Content-Agent-Lernapp PR 560` ergibt Repo Lern-App, PR 560; `pruefer PR 413` ergibt Leitstand, PR 413", () => {
  assert.deepEqual(prueferLaufziel("pruefer siinanXD/Content-Agent-Lernapp PR 560"), { repo: "siinanXD/Content-Agent-Lernapp", pr: 560 });
  assert.deepEqual(prueferLaufziel("pruefer PR 413"), { repo: "siinanXD/Leitstand", pr: 413 });
  assert.deepEqual(prueferLaufziel("pruefer siinanXD/Leitstand PR 7"), { repo: "siinanXD/Leitstand", pr: 7 });
});

test("Test: unbekanntes Repo wird abgelehnt (nur freigegebene Produkt-Repos)", () => {
  assert.equal(prueferLaufziel("pruefer evil/repo PR 1"), null);
  assert.equal(prueferLaufziel("pruefer siinanXD/Content-Agent-Lernapp-fork PR 1"), null);
  assert.equal(prueferLaufziel("pruefer PR 0"), null);
  assert.equal(prueferLaufziel("pruefer PR 12 extra"), null);
  assert.equal(prueferLaufziel("build"), null);
});
