import assert from "node:assert/strict";
import { test } from "node:test";
import { bewertungsPrompt, gedaechtnisZeilen, issueFuer, istKandidat, kachelFunde, kachelPayload, leseFund, leseKachel, mische, zuwachs, type Messung } from "./trend";

const jetzt = new Date("2026-10-13T12:00:00Z");
const m = (o: Partial<Messung> = {}): Messung => ({ id: "github:a/b", quelle: "github", was: "a/b", url: "https://github.com/a/b", lizenz: "MIT", sterne: 2000, aktiv: true, angelegt: "2026-09-20", beschreibung: "Agenten-Framework", ...o });
const antwort = (o: Record<string, unknown> = {}) => ({ betrifft: "leitstand", nutzen: "Spart Kosten.", aufwand_tage: 2, risiko: "niedrig", empfehlung: "version", jetzt_grund: null, ...o });

test("Zuwachs und Kandidat: neu > 1.000 Sterne oder +30 %", () => {
  assert.equal(zuwachs(100, 140), 0.4);
  assert.equal(zuwachs(undefined, 140), null);
  assert.ok(istKandidat(m(), undefined, jetzt));
  assert.ok(!istKandidat(m({ angelegt: "2025-01-01" }), 1900, jetzt));
  assert.ok(istKandidat(m({ angelegt: "2025-01-01" }), 1000, jetzt));
  assert.ok(!istKandidat(m({ sterne: 900 }), undefined, jetzt));
  assert.ok(istKandidat(m({ quelle: "huggingface", angelegt: null }), undefined, jetzt));
});

test("Fund: Zahlen aus der Messung, nicht vom Modell", () => {
  const f = leseFund({ ...antwort(), sterne: 1, lizenz: "GPL", url: "http://böse" }, m(), 1000, "2026-10-13");
  assert.ok(f);
  assert.equal(f.sterne, 2000);
  assert.equal(f.lizenz, "MIT");
  assert.equal(f.url, "https://github.com/a/b");
  assert.equal(f.zuwachs, 1);
});

test("Regel: nicht erlaubt → höchstens beobachten; jetzt braucht Grund", () => {
  assert.equal(leseFund(antwort(), m({ lizenz: "GPL-3.0" }), undefined, "d")?.empfehlung, "beobachten");
  assert.equal(leseFund(antwort(), m({ sterne: 500 }), undefined, "d")?.empfehlung, "beobachten");
  assert.equal(leseFund(antwort(), m({ aktiv: false }), undefined, "d")?.empfehlung, "beobachten");
  assert.equal(leseFund(antwort({ empfehlung: "jetzt" }), m(), undefined, "d")?.empfehlung, "version");
  assert.equal(leseFund(antwort({ empfehlung: "jetzt", jetzt_grund: "sicherheit" }), m({ lizenz: "Apache-2.0" }), undefined, "d")?.empfehlung, "jetzt");
  assert.equal(leseFund(antwort({ empfehlung: "jetzt", jetzt_grund: "sicherheit" }), m({ lizenz: "GPL" }), undefined, "d")?.jetzt_grund, null);
  assert.equal(leseFund(antwort({ betrifft: "keins" }), m(), undefined, "d")?.empfehlung, "beobachten");
});

test("Ungültige Antwort wird abgelehnt", () => {
  assert.equal(leseFund(null, m(), undefined, "d"), null);
  assert.equal(leseFund(antwort({ betrifft: "alle!" }), m(), undefined, "d"), null);
  assert.equal(leseFund(antwort({ nutzen: "" }), m(), undefined, "d"), null);
  assert.equal(leseFund(antwort({ aufwand_tage: -1 }), m(), undefined, "d"), null);
});

test("Kachel: drei beste, ohne nein; Payload round-trip; Gedächtnis höchstens drei Zeilen", () => {
  const f = (id: string, empfehlung: string, sterne: number) => leseFund(antwort({ empfehlung }), m({ id, was: id, sterne }), undefined, "d")!;
  const funde = [f("a", "nein", 9000), f("b", "beobachten", 3000), f("c", "version", 1000), f("d", "version", 2000), f("e", "beobachten", 5000)];
  assert.deepEqual(kachelFunde(funde).map((x) => x.was), ["d", "c", "e"]);
  assert.deepEqual(leseKachel(kachelPayload(funde)).map((x) => x.was), ["d", "c", "e"]);
  assert.equal(gedaechtnisZeilen(funde).length, 3);
  assert.deepEqual(leseKachel({ top: [{ was: "x", url: "javascript:1", empfehlung: "jetzt", betrifft: "alle" }] }), []);
  assert.deepEqual(leseKachel(null), []);
});

test("Mischen ersetzt gleiche Kennung", () => {
  const a = leseFund(antwort(), m(), undefined, "alt")!;
  const b = leseFund(antwort({ empfehlung: "beobachten" }), m(), undefined, "neu")!;
  const r = mische([a], [b]);
  assert.equal(r.length, 1);
  assert.equal(r[0].datum, "neu");
});

test("Issue: jetzt ist nur ein Vorschlag, Prompt trennt Daten", () => {
  const f = leseFund(antwort({ empfehlung: "jetzt", jetzt_grund: "kosten" }), m(), undefined, "d")!;
  const i = issueFuer(f);
  assert.ok(i.vorschlagDringend && i.titel.startsWith("Dringend?"));
  assert.match(i.beschreibung, /nie selbst `dringend`/);
  assert.match(bewertungsPrompt(m()), /<fund>.*Agenten-Framework.*<\/fund>/);
});
