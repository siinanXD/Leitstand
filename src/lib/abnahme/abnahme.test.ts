import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { alarmeAus, bewerteText, bewerteZeilen, einsetzen, ereignisZeile, parseProben, staende, type Probe } from "./abnahme";

const H = 3_600_000;
const jetzt = Date.parse("2026-10-14T12:00:00Z");
const vor = (ms: number) => new Date(jetzt - ms).toISOString();
const probe = (extra: Record<string, string> = {}): Probe => ({ id: "p", produkt: "leitstand", titel: "Test", art: "db", ...extra });
const lauf = (status: string, ms: number, titel = "Test") => ({ project: "leitstand", step: "abnahme", status, issue: titel, created_at: vor(ms) });

test("docs/abnahme.yml ist lesbar und hat mindestens 10 Proben für Leitstand, Gedächtnis und Lern-App", () => {
  const proben = parseProben(readFileSync("docs/abnahme.yml", "utf8"));
  assert.ok(proben.length >= 10);
  for (const produkt of ["leitstand", "gedaechtnis", "lernapp"]) assert.ok(proben.some((p) => p.produkt === produkt), produkt);
});

test("parseProben: Felder, Anführungszeichen, Kommentare; Fehler bei doppelter id und unbekannter Art", () => {
  const [p] = parseProben('# Kommentar\n- id: a\n  produkt: x\n  titel: "Ein: Titel"\n  art: http\n  url: https://x.de/a?b=c\n');
  assert.deepEqual(p, { id: "a", produkt: "x", titel: "Ein: Titel", art: "http", url: "https://x.de/a?b=c" });
  assert.throws(() => parseProben("- id: a\n  produkt: x\n  titel: t\n  art: http\n- id: a\n  produkt: x\n  titel: u\n  art: http\n"), /doppelt/);
  assert.throws(() => parseProben("- id: a\n  produkt: x\n  titel: t\n  art: sql\n"), /unbekannt/);
  assert.throws(() => parseProben("- id: a\n  produkt: x\n  art: http\n"), /titel/);
});

test("einsetzen: fehlender Wert ist ein Fehler, nie ein leerer Text", () => {
  assert.equal(einsetzen("${A}/x", { A: "https://a" }), "https://a/x");
  assert.throws(() => einsetzen("${A}/x", {}), /A fehlt/);
});

test("bewerteZeilen: Alter, Anzahl und leeres Feld", () => {
  const p = probe({ zeitfeld: "t", max_alter_min: "60", nicht_leer: "queue" });
  assert.equal(bewerteZeilen(p, [{ t: vor(30 * 60_000), queue: { a: 1 } }], jetzt).ok, true);
  assert.match(bewerteZeilen(p, [{ t: vor(2 * H), queue: { a: 1 } }], jetzt).grund, /älter als 60/);
  assert.match(bewerteZeilen(p, [{ t: vor(60_000), queue: {} }], jetzt).grund, /queue ist leer/);
  assert.match(bewerteZeilen(p, [], jetzt).grund, /0 Zeilen/);
  assert.equal(bewerteZeilen(p, { fehler: 1 }, jetzt).ok, false);
});

test("bewerteText und ereignisZeile", () => {
  assert.equal(bewerteText(probe({ enthaelt: "# Offen" }), "# Offen\n").ok, true);
  assert.equal(bewerteText(probe({ enthaelt: "# Offen" }), "leer").ok, false);
  assert.equal(ereignisZeile(probe(), { ok: false, grund: "x" }, null, null).status, "failed");
  assert.deepEqual([ereignisZeile(probe(), { ok: true, grund: "ok" }, null, null).step, ereignisZeile(probe(), { ok: true, grund: "ok" }, null, null).issue], ["abnahme", "Test"]);
});

test("staende: rot seit dem ersten roten Lauf nach dem letzten grünen", () => {
  const [s] = staende([lauf("failed", 0), lauf("failed", H), lauf("failed", 2 * H), lauf("ok", 3 * H), lauf("failed", 4 * H)]);
  assert.equal(s.ok, false);
  assert.equal(s.rotSeit, jetzt - 2 * H);
  assert.equal(staende([lauf("ok", 0), lauf("failed", H)])[0].rotSeit, null);
});

test("Alarm: absichtlich rote Probe löst nach mehr als 2 Stunden Alarm aus, vorher und bei grün nicht", () => {
  const rot = [lauf("failed", 0), lauf("failed", H), lauf("failed", 2.5 * H)];
  const alarme = alarmeAus(rot, jetzt);
  assert.equal(alarme.length, 1);
  assert.deepEqual([alarme[0].art, alarme[0].projekt, alarme[0].titel], ["alarm", "leitstand", "Probe rot: Test"]);
  assert.equal(alarmeAus(rot, jetzt)[0].id, alarme[0].id, "dieselbe Kennung, damit nicht doppelt gesendet wird");
  assert.equal(alarmeAus([lauf("failed", 0), lauf("failed", H)], jetzt).length, 0);
  assert.equal(alarmeAus([lauf("ok", 0), ...rot.slice(1)], jetzt).length, 0);
  assert.equal(alarmeAus([{ ...lauf("failed", 3 * H), step: "worker" }], jetzt).length, 0);
});
