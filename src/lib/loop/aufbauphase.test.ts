import { test } from "node:test";
import assert from "node:assert/strict";
import { probe } from "../../../scripts/loop/aufbauphase-probe.mjs";
import { bewerteText, parseProben } from "../abnahme/abnahme";
import { readFileSync } from "node:fs";

test("echtes Auto-Merge-Skript: Altfristen weg, Schutzgrenzen bleiben (SIN-855)", async () => {
  const ergebnis = await probe();
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.faelle.length >= 9);
  const abnahme = parseProben(readFileSync("docs/abnahme.yml", "utf8"))
    .find((p) => p.id === "leitstand-aufbauphase-integration");
  assert.ok(abnahme);
  assert.equal(bewerteText(abnahme, JSON.stringify(ergebnis, null, 2)).ok, true);
});
