import assert from "node:assert/strict";
import { test } from "node:test";
import { ohneKennungen, zeitInWorten } from "./zeit";

const jetzt = new Date("2026-10-13T14:00:00Z");
const vor = (min: number) => new Date(jetzt.getTime() - min * 60_000).toISOString();

test("zeitInWorten: Vergangenheit in Worten, nie Minuten", () => {
  assert.equal(zeitInWorten(vor(2), jetzt), "gerade eben");
  assert.equal(zeitInWorten(vor(30), jetzt), "vor kurzem");
  assert.equal(zeitInWorten(vor(70), jetzt), "vor einer Stunde");
  assert.equal(zeitInWorten(vor(120), jetzt), "vor 2 Stunden");
  assert.equal(zeitInWorten(vor(60 * 13), jetzt), "heute");
  assert.equal(zeitInWorten(vor(60 * 30), jetzt), "gestern");
  assert.equal(zeitInWorten(vor(1400), jetzt), "gestern");
  assert.equal(zeitInWorten(vor(60 * 24 * 4), jetzt), "diese Woche");
  assert.equal(zeitInWorten(vor(60 * 24 * 20), jetzt), "vor über einer Woche");
});

test("zeitInWorten: Zukunft und Unlesbares", () => {
  assert.equal(zeitInWorten(new Date(jetzt.getTime() + 3_600_000).toISOString(), jetzt), "heute");
  assert.equal(zeitInWorten(new Date(jetzt.getTime() + 24 * 3_600_000).toISOString(), jetzt), "morgen");
  assert.equal(zeitInWorten(new Date(jetzt.getTime() + 3 * 24 * 3_600_000).toISOString(), jetzt), "diese Woche");
  assert.equal(zeitInWorten("kaputt", jetzt), null);
});

test("ohneKennungen: Kennungen, Minuten und Zeitstempel fallen weg", () => {
  assert.equal(ohneKennungen("Richter wird besser (SIN-12)."), "Richter wird besser.");
  assert.equal(ohneKennungen("Gate-Regel PR #34 wartet"), "Gate-Regel wartet");
  assert.equal(ohneKennungen("Fertig 2026-10-13T14:00:00Z"), "Fertig");
  assert.equal(ohneKennungen("Lauf 120 ms und 5 MIN"), "Lauf und");
  assert.equal(ohneKennungen("Lauf 7a1c0000-0000-4000-8000-000000000000 fertig"), "Lauf fertig");
  assert.equal(ohneKennungen("Richter wird besser"), "Richter wird besser");
});
