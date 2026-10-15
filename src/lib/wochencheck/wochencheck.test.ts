import assert from "node:assert/strict";
import { test } from "node:test";
import { berlinZeit } from "../push/ausloeser";
import { ergebnisEingabe, ergebnisMarkdown, notizPfad, pushStunde, pushVorbereiten, PUNKTE } from "./wochencheck";

const utc = (s: string) => Date.parse(s);
const SONNTAG_19 = utc("2026-10-18T17:00:00Z"); // 19:00 MEZ/MESZ je nach Datum, hier 19:00 Berlin

test("Push: sonntags ab der eingestellten Stunde, einmal je Tag", () => {
  assert.equal(berlinZeit(SONNTAG_19).stunde, 19);
  const p = pushVorbereiten(SONNTAG_19, 19, new Set());
  assert.equal(p?.schluessel, "wochencheck:2026-10-18");
  assert.equal(p?.nachricht.url, "/wochen-check");
  assert.equal(pushVorbereiten(SONNTAG_19, 19, new Set(["wochencheck:2026-10-18"])), null);
  assert.equal(pushVorbereiten(SONNTAG_19 - 3600_000, 19, new Set()), null, "vor 19:00 noch nichts");
  assert.equal(pushVorbereiten(SONNTAG_19 + 3600_000, 19, new Set())?.schluessel, "wochencheck:2026-10-18", "fällt der Lauf um 19:00 aus, kommt er später");
  assert.equal(pushVorbereiten(SONNTAG_19 + 86_400_000, 19, new Set()), null, "montags nie");
  assert.equal(pushVorbereiten(SONNTAG_19 + 4 * 3600_000, 19, new Set()), null, "nicht in der Ruhezeit ab 22:00");
});

test("Uhrzeit: nur ganze Stunden 0 bis 23, sonst 19", () => {
  assert.equal(pushStunde("8"), 8);
  assert.equal(pushStunde("24"), 19);
  assert.equal(pushStunde("x"), 19);
  assert.equal(pushStunde(undefined), 19);
});

test("Eingabe: prüft Haken, Fehler (höchstens 5 Zeilen) und Vorrang", () => {
  const e = ergebnisEingabe({ haken: [PUNKTE[0].id, "unbekannt"], fehler: " a \n\n b ", vorrang: " Tests " });
  assert.deepEqual(e, { haken: [PUNKTE[0].id], fehler: ["a", "b"], vorrang: "Tests" });
  assert.equal(ergebnisEingabe({ haken: "x" }), null);
  assert.equal(ergebnisEingabe(null), null);
  assert.equal(ergebnisEingabe({ haken: [], fehler: "1\n2\n3\n4\n5\n6", vorrang: "" }), null);
  assert.equal(ergebnisEingabe({ haken: [], fehler: "", vorrang: "x".repeat(281) }), null);
});

test("Notiz: Pfad Tage/<Datum>-wochencheck.md, offene Punkte sichtbar", () => {
  assert.equal(notizPfad("2026-10-18"), "Tage/2026-10-18-wochencheck.md");
  const m = ergebnisMarkdown("2026-10-18", { haken: [PUNKTE[0].id], fehler: ["Einheit 12 falsch"], vorrang: "Tests" }, ["SIN-700"]);
  assert.match(m, /- \[x\] .*Kennzahlen/);
  assert.match(m, /- \[ \] .*Freigaben/);
  assert.match(m, /Einheit 12 falsch/);
  assert.match(m, /SIN-700/);
  assert.match(m, /Vorrang nächste Woche: Tests/);
});
