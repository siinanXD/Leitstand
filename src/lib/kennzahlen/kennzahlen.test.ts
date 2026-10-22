import { test } from "node:test";
import assert from "node:assert/strict";
import { alle, fehlgeschlagen, reihe, verkaufsfertig, wochenStart, wochenZeilen, zahlText, zeileText, type Einheit } from "./kennzahlen";

const ok: Einheit = { veroeffentlicht: true, ersterDurchlaufBestanden: true, quelleKursPassend: true, inRoterProbe: false };

test("verkaufsfertig zählt nur veröffentlichte Einheiten mit allen drei Bedingungen", () => {
  const liste: Einheit[] = [ok, ok, { ...ok, ersterDurchlaufBestanden: false }, { ...ok, quelleKursPassend: false }, { ...ok, inRoterProbe: true }, { ...ok, veroeffentlicht: false }];
  assert.deepEqual(verkaufsfertig(liste), { zaehler: 2, nenner: 5 });
  assert.deepEqual(verkaufsfertig([]), { zaehler: 0, nenner: 0 });
});

test("fehlgeschlagen: nur Ereignisse binnen 48 h nach dem Merge", () => {
  const m = "2026-10-12T10:00:00Z";
  const r = fehlgeschlagen([
    { gemergtAm: m },
    { gemergtAm: m, zurueckgenommenAm: "2026-10-13T09:00:00Z" },
    { gemergtAm: m, repariertAm: "2026-10-14T10:00:00Z" },
    { gemergtAm: m, roteProbeAm: "2026-10-14T10:00:01Z" },
    { gemergtAm: m, roteProbeAm: "2026-10-12T09:00:00Z" },
  ]);
  assert.deepEqual(r, { zaehler: 2, nenner: 5 });
});

test("wochenStart ist der Montag", () => {
  assert.equal(wochenStart(Date.parse("2026-10-15T12:00:00Z")), "2026-10-12");
  assert.equal(wochenStart(Date.parse("2026-10-18T23:59:00Z")), "2026-10-12");
});

test("reihe: 8 Wochen, Lücken und Nenner 0 sind null, nie 0", () => {
  const r = reihe(
    "verkaufsfertig",
    [
      { kennzahl: "verkaufsfertig", woche: "2026-10-05", zaehler: 9, nenner: 10 },
      { kennzahl: "verkaufsfertig", woche: "2026-10-12", zaehler: 0, nenner: 0 },
      { kennzahl: "kosten_je_einheit", woche: "2026-10-12", zaehler: 5, nenner: 1 },
    ],
    new Date("2026-10-15T12:00:00Z"),
  );
  assert.equal(r.punkte.length, 8);
  assert.equal(r.punkte[7].woche, "2026-10-12");
  assert.equal(r.punkte[7].wert, null);
  assert.equal(r.punkte[6].wert, 0.9);
  assert.equal(r.aktuell, 0.9);
});

test("Texte: Prozent, Euro, ohne Daten ehrlich", () => {
  const k = alle([{ kennzahl: "kosten_je_einheit", woche: "2026-10-12", zaehler: 7, nenner: 4 }], new Date("2026-10-15T12:00:00Z"));
  assert.equal(k.length, 3);
  assert.equal(zahlText(k[1]), "1,75 €");
  assert.equal(zeileText(k[0]), "Verkaufsfertig: noch keine Zahl");
});

test("wochenZeilen: Kennzahl mit Nenner > 0 bekommt eine Zeile, ohne Nenner keine", () => {
  const woche = "2026-10-12";
  const einheiten: Einheit[] = [
    { ...ok, bestandenAm: "2026-10-13T10:00:00Z" },
    { ...ok, bestandenAm: "2026-10-14T10:00:00Z", inRoterProbe: true },
    { ...ok, bestandenAm: "2026-10-05T10:00:00Z" },
  ];
  const kosten = [{ am: "2026-10-13T08:00:00Z", eur: 3 }, { am: "2026-10-15T08:00:00Z", eur: 1.5 }, { am: "2026-10-06T08:00:00Z", eur: 99 }];
  assert.deepEqual(wochenZeilen(woche, einheiten, kosten, []), [
    { kennzahl: "verkaufsfertig", woche, zaehler: 2, nenner: 3 },
    { kennzahl: "kosten_je_einheit", woche, zaehler: 4.5, nenner: 2 },
  ]);
  const prs = [{ gemergtAm: "2026-10-13T10:00:00Z", zurueckgenommenAm: "2026-10-13T12:00:00Z" }, { gemergtAm: "2026-10-14T10:00:00Z" }, { gemergtAm: "2026-10-01T10:00:00Z" }];
  assert.deepEqual(wochenZeilen(woche, [], kosten, prs), [{ kennzahl: "fehlgeschlagene_aenderungen", woche, zaehler: 1, nenner: 2 }]);
});
