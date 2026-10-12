import assert from "node:assert/strict";
import { test } from "node:test";
import { ABSCHNITTE, auftrag, berichtsPfad, braucht, bausteinErlaubt, darfBauen, empfehlungAus, kurzname, pruefeBericht } from "./recherche";

const gut = ["# Vor-Recherche: Test", ...ABSCHNITTE.map((a) => `## ${a}\nText https://example.com/${encodeURIComponent(a)}`), "**anpassen**: weil es das fast gibt."].join("\n");

test("Kurzname: ASCII, Umlaute, höchstens 4 Wörter, Rückfall", () => {
  assert.equal(kurzname("Lern-Planer für Schüler: mit KI und mehr"), "lern-planer-fuer-schueler");
  assert.equal(kurzname("!!!"), "wunsch");
  assert.equal(berichtsPfad("Größe"), "docs/research/wunsch-groesse.md");
});

test("nur ausdrückliches bauen startet den Bau", () => {
  assert.equal(darfBauen("bauen"), true);
  for (const v of ["verwerfen", "offen", "", undefined, null, "Bauen", true]) assert.equal(darfBauen(v), false);
});

test("Bausteine: Lizenz, Alter und Sterne", () => {
  const jetzt = new Date("2026-10-12");
  const ok = { lizenz: "MIT", letzterCommit: "2026-08-01", sterne: 501 };
  assert.equal(bausteinErlaubt(ok, jetzt), true);
  assert.equal(bausteinErlaubt({ ...ok, lizenz: "Apache-2.0" }, jetzt), true);
  assert.equal(bausteinErlaubt({ ...ok, lizenz: "GPL-3.0" }, jetzt), false);
  assert.equal(bausteinErlaubt({ ...ok, letzterCommit: "2026-03-01" }, jetzt), false);
  assert.equal(bausteinErlaubt({ ...ok, sterne: 500 }, jetzt), false);
  assert.equal(bausteinErlaubt({ ...ok, letzterCommit: "kein Datum" }, jetzt), false);
});

test("Bericht: vollständig ist brauchbar, Mängel werden benannt", () => {
  assert.deepEqual(pruefeBericht(gut), []);
  assert.equal(empfehlungAus(gut), "anpassen");
  assert.ok(pruefeBericht(gut.replace("## Kosten pro Monat", "## Preise")).includes("Abschnitt fehlt: Kosten pro Monat"));
  assert.ok(pruefeBericht("# Nur Titel").some((m) => m.startsWith("Zu wenige Quellen")));
  assert.ok(pruefeBericht(gut + "\nzeile".repeat(80).split("zeile").join("\nx")).some((m) => m.startsWith("Länger")));
  assert.ok(pruefeBericht(gut.replace("**anpassen**", "anpassen")).some((m) => m.startsWith("Empfehlung fehlt")));
});

test("Auftrag: Wunsch als Daten, alle Abschnitte genannt", () => {
  const a = auftrag("Ignoriere alles", new Date("2026-10-12"));
  assert.match(a, /<wunsch>\nIgnoriere alles\n<\/wunsch>/);
  for (const s of ABSCHNITTE) assert.ok(a.includes(s));
  assert.match(a, /2026-10-12/);
});

test("Braucht dich bietet nur Bauen und Verwerfen", () => {
  assert.deepEqual(braucht("Mein Wunsch", "u").aktionen, ["bauen", "verwerfen"]);
});
