import assert from "node:assert/strict";
import { test } from "node:test";
import { heuteFertigAus, laufende, parseAufgaben, projektAusLinear, statusAusLinear, titelVon } from "./aufgaben";

const zeilen = parseAufgaben([
  { issue: "SIN-1", titel: "Richter prüft Fakten", projekt: "lernapp", status: "laeuft", gestartet_at: "2026-10-13T14:00:00Z", labels: ["claude"] },
  { issue: "SIN-2", titel: "Leiste unten", projekt: "leitstand", status: "fertig", fertig_at: "2026-10-13T15:30:00Z" },
  { issue: "SIN-3", titel: "Alt", projekt: "leitstand", status: "fertig", fertig_at: "2026-10-12T10:00:00Z" },
  { issue: "SIN-4", titel: "", status: "offen" },
  { issue: "SIN-5", titel: "Später gestartet", projekt: "leitstand", status: "laeuft", gestartet_at: "2026-10-13T15:00:00Z", labels: ["claude"] },
  { issue: "SIN-6", titel: "Sammel-Issue", projekt: "leitstand", status: "laeuft", gestartet_at: "2026-10-13T15:30:00Z" },
]);

test("Aufgaben: ohne Titel fällt weg, Titel per Kennung", () => {
  assert.equal(zeilen.length, 5);
  assert.equal(titelVon(zeilen, "SIN-1"), "Richter prüft Fakten");
  assert.equal(titelVon(zeilen, "SIN-99"), null);
});

test("Aufgaben: laufende jüngster Start zuerst, heute fertig nur von heute", () => {
  assert.deepEqual(laufende(zeilen).map((a) => a.issue), ["SIN-5", "SIN-1"]);
  assert.deepEqual(heuteFertigAus(zeilen, new Date("2026-10-13T16:00:00Z")).map((a) => a.issue), ["SIN-2"]);
});

test("Aufgaben: Linear-Zustände und Projektnamen", () => {
  assert.equal(statusAusLinear("started"), "laeuft");
  assert.equal(statusAusLinear("completed"), "fertig");
  assert.equal(statusAusLinear("backlog"), "offen");
  assert.equal(projektAusLinear("Content-Agent-Lernapp"), "lernapp");
  assert.equal(projektAusLinear("Leitstand"), "leitstand");
  assert.equal(projektAusLinear("SJCODE Website"), "sjcode-website");
});
