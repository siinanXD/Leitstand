import { test } from "node:test";
import assert from "node:assert/strict";
import { fehlergrund, kategorie, kategorieAusGrund, topGruende } from "./fehlergrund";

test("kategorie erkennt die Fehlerarten", () => {
  const faelle: [string, string][] = [
    ["Error: 429 Too Many Requests", "Kontingent"],
    ["CONFLICT (content): Merge conflict in a.ts", "Merge-Konflikt"],
    ["The job running on runner exceeded the maximum execution time", "Zeitüberschreitung"],
    ["Resource not accessible by integration", "Rechte fehlen"],
    ["3 tests failed", "Test rot"],
    ["etwas ganz anderes", "Sonstiges"],
  ];
  for (const [text, erwartet] of faelle) assert.equal(kategorie(text), erwartet, text);
});

test("fehlergrund nimmt die erste Zeile ohne Marker und kürzt", () => {
  assert.equal(fehlergrund("\n::error::Timeout nach 30 min\nzweite"), "Zeitüberschreitung: Timeout nach 30 min");
  assert.ok(fehlergrund("x".repeat(500)).length < 200);
});

test("fehlergrund liefert auch ohne Text einen Grund", () => {
  assert.equal(fehlergrund(""), "Sonstiges: keine Fehlermeldung erfasst");
  assert.match(fehlergrund(null), /^Sonstiges/);
});

test("kategorieAusGrund liest die Kategorie zurück", () => {
  assert.equal(kategorieAusGrund("Test rot: x"), "Test rot");
  assert.equal(kategorieAusGrund(null), "Ohne Grund");
});

test("topGruende zählt nur rote Einträge der letzten 24 h, Top 3", () => {
  const jetzt = new Date("2026-10-15T12:00:00Z");
  const e = (status: string, grund: string | null, h: number) => ({ status, grund, created_at: new Date(jetzt.getTime() - h * 3_600_000).toISOString() });
  const liste = [e("fehler", "Test rot: a", 1), e("fehler", "Test rot: b", 2), e("fehler", "Kontingent: c", 3), e("fehler", null, 4), e("fehler", "Sonstiges: d", 5), e("ok", null, 1), e("fehler", "Test rot: alt", 30)];
  assert.deepEqual(topGruende(liste, jetzt), [
    { kategorie: "Test rot", anzahl: 2 },
    { kategorie: "Kontingent", anzahl: 1 },
    { kategorie: "Ohne Grund", anzahl: 1 },
  ]);
});
