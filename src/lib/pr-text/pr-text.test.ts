import assert from "node:assert/strict";
import { test } from "node:test";
import { pruefePrText } from "./pr-text";

test("Test: Der `pr-text`-Check schlägt bei einem PR-Text mit „12,40 €“ und „Wunsch Sinan“ an", () => {
  const treffer = pruefePrText("Kosten 12,40 € wegen Wunsch Sinan: billiger");
  assert.ok(treffer.includes("Geldbetrag (€)"));
  assert.ok(treffer.includes("Wunsch einer Person"));
  assert.ok(treffer.includes("Sinan-Zitat"));
});

test("pr-text erkennt Supabase-Projekt-ID", () => {
  assert.deepEqual(pruefePrText("abcdefghijklmnopqrst.supabase.co"), ["Supabase-Projekt-ID"]);
});

test("pr-text lässt knappe technische Texte durch", () => {
  assert.deepEqual(pruefePrText("Closes #1\n\nissueText liefert nur Titel, Link und Haken (SIN-911). 3 Tests grün."), []);
  assert.deepEqual(pruefePrText(null), []);
});
