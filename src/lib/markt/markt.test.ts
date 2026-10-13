import assert from "node:assert/strict";
import { test } from "node:test";
import { botschaftenFuerMarketing, ereignisZeile, istMonat, leseErgebnis, markdown, MAX_IDEEN, pfad, promptFuer } from "./markt";

const eintrag = (anbieter: string) => ({ anbieter, funktion: "Lernpfade", preis: "9 €/Monat | Gruppe", quelle: "https://example.com/preise", datum: "2026-11-01" });
const idee = (n: number) => ({ titel: `Idee ${n}`, beschreibung: "Lernpfade je Azubi", quelle: "https://example.com/a" });
const FIXTURE = {
  produkt: "Lern-App",
  eintraege: [eintrag("A"), eintrag("B"), eintrag("C")],
  botschaften: [{ anbieter: "A", text: "Bestehe die IHK-Prüfung", quelle: "https://example.com" }],
  ideen: [idee(1), idee(2), idee(3), idee(4)],
};

test("gültiges Ergebnis: höchstens 3 Ideen", () => {
  const e = leseErgebnis(FIXTURE);
  assert.ok(e);
  assert.equal(e.ideen.length, MAX_IDEEN);
});

test("weniger als 3 Anbieter, fehlende oder unsichere Quelle: abgelehnt", () => {
  assert.equal(leseErgebnis(null), null);
  assert.equal(leseErgebnis({ ...FIXTURE, eintraege: [eintrag("A"), eintrag("A"), eintrag("B")] }), null);
  assert.equal(leseErgebnis({ ...FIXTURE, eintraege: [...FIXTURE.eintraege, { ...eintrag("D"), quelle: "http://example.com" }] }), null);
  assert.equal(leseErgebnis({ ...FIXTURE, eintraege: [...FIXTURE.eintraege, { ...eintrag("D"), datum: "gestern" }] }), null);
  assert.equal(leseErgebnis({ ...FIXTURE, ideen: [{ titel: "x", beschreibung: "y" }] }), null);
});

test("Markdown: Tabelle mit maskiertem Pipe-Zeichen, Botschaften für das Marketing", () => {
  const e = leseErgebnis(FIXTURE);
  assert.ok(e);
  const md = markdown(e, "2026-11");
  assert.match(md, /\| Anbieter \| Funktion \| Preis \| Quelle \| Datum \|/);
  assert.match(md, /9 €\/Monat \\\| Gruppe/);
  assert.deepEqual(botschaftenFuerMarketing(e), ["A: Bestehe die IHK-Prüfung"]);
});

test("Pfad, Monat, Prompt, Ereignis", () => {
  assert.equal(pfad("2026-11"), "docs/markt/2026-11.md");
  assert.ok(istMonat("2026-11") && !istMonat("2026-13") && !istMonat("../x"));
  assert.match(promptFuer("Lern-App", ["A", "B"], "2026-11"), /A, B/);
  assert.equal(ereignisZeile("Lern-App", true, 2).payload.ideen, 2);
});
