import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseProben, bewerteText } from "../abnahme/abnahme";

test("SIN-615-Abnahme liest historische Merkmale und reparierten Produktlink aus dem produktiven Vault", () => {
  const proben = parseProben(readFileSync("docs/abnahme.yml", "utf8")).filter(p => p.id.startsWith("gedaechtnis-historie-"));
  assert.equal(proben.length, 4);
  for (const p of proben) {
    assert.equal(p.art, "github");
    assert.equal(p.repo, "siinanXD/gedaechtnis");
    assert.equal(p.pfad, "Entscheidungen/SIN-639.md");
  }
  const notiz = "datum: 2026-10-15\nstatus: gilt\nEntscheidungsdatei: https://github.com/siinanXD/Leitstand/blob/main/docs/decisions/SIN-639-pruefer-zweites-modell.md\n[[Produkte/Leitstand]]";
  assert.ok(proben.every(p => bewerteText(p, notiz).ok));
  for (const entfernt of ["datum: 2026-10-15", "status: gilt", "Entscheidungsdatei:", "[[Produkte/Leitstand]]"]) {
    assert.ok(proben.some(p => !bewerteText(p, notiz.replace(entfernt, "")).ok));
  }
  assert.ok(proben.some(p => !bewerteText(p, notiz.replace("Produkte/Leitstand", "Produkte/leitstand")).ok));
});
