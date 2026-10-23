import assert from "node:assert/strict";
import { test } from "node:test";
import { antwortEingabe, antwortKommentar, beantworte, leseBlock, MARKER_ANTWORT, type EntscheidungsNetz } from "./entscheidung";

const block = {
  frage: "Welche Datenbank?",
  art: "infrastruktur",
  optionen: [
    { titel: "Eigenes Projekt", folge: "Neue Migration" },
    { titel: "Gleiches Projekt", folge: "Weniger Aufwand" },
  ],
  empfehlung: "Eigenes Projekt",
  recherche: ["docs/decisions/x.md"],
};
const beschreibung = `Text davor\n<!-- entscheidung ${JSON.stringify(block)} -->\nText danach`;

test("Block mit Frage, Art, Optionen und Empfehlung wird gelesen", () => {
  const b = leseBlock(beschreibung);
  assert.equal(b?.frage, "Welche Datenbank?");
  assert.equal(b?.art, "infrastruktur");
  assert.deepEqual(b?.optionen.map((o) => o.titel), ["Eigenes Projekt", "Gleiches Projekt"]);
  assert.equal(b?.empfehlung, "Eigenes Projekt");
  assert.deepEqual(b?.recherche, ["docs/decisions/x.md"]);
});

test("kaputter oder fehlender Block ergibt null", () => {
  assert.equal(leseBlock(null), null);
  assert.equal(leseBlock("kein Block"), null);
  assert.equal(leseBlock("<!-- entscheidung {kaputt -->"), null);
  assert.equal(leseBlock(`<!-- entscheidung ${JSON.stringify({ ...block, art: "unbekannt" })} -->`), null);
  assert.equal(leseBlock(`<!-- entscheidung ${JSON.stringify({ ...block, optionen: [] })} -->`), null);
  assert.equal(leseBlock(`<!-- entscheidung ${JSON.stringify({ ...block, optionen: [{ folge: "x" }] })} -->`), null);
  assert.equal(leseBlock(`<!-- entscheidung ${JSON.stringify({ ...block, frage: " " })} -->`), null);
});

test("Antwort-Kommentar enthält Wahl, Datum und Marker", () => {
  const k = antwortKommentar("Eigenes Projekt", new Date("2026-10-23T12:00:00Z"));
  assert.ok(k.includes("Eigenes Projekt"));
  assert.ok(k.includes("2026-10-23"));
  assert.ok(k.includes(MARKER_ANTWORT));
});

test("antwortEingabe verlangt Kennung und genau eine Wahl", () => {
  assert.deepEqual(antwortEingabe({ issue: "SIN-5", option: " A " }), { issue: "SIN-5", option: "A" });
  assert.deepEqual(antwortEingabe({ issue: "SIN-5", text: "frei" }), { issue: "SIN-5", text: "frei" });
  assert.equal(antwortEingabe({ issue: "SIN-5" }), null);
  assert.equal(antwortEingabe({ issue: "SIN-5", option: "A", text: "B" }), null);
  assert.equal(antwortEingabe({ issue: "x", option: "A" }), null);
  assert.equal(antwortEingabe(null), null);
});

const netz = (): EntscheidungsNetz & { kommentare: string[] } => {
  const kommentare: string[] = [];
  return {
    kommentare,
    offene: async () => [],
    beschreibung: async (k) => (k === "SIN-5" ? beschreibung : null),
    beantworten: async (_k, kommentar) => void kommentare.push(kommentar),
  };
};

test("beantworte schreibt den Kommentar nur für eine Option des Blocks", async () => {
  const n = netz();
  assert.deepEqual(await beantworte(n, { issue: "SIN-5", option: "Eigenes Projekt" }, new Date("2026-10-23T00:00:00Z")), { ok: true, kennung: "SIN-5", wahl: "Eigenes Projekt" });
  assert.equal(n.kommentare.length, 1);
  assert.deepEqual(await beantworte(n, { issue: "SIN-5", option: "Gibt es nicht" }), { ok: false, grund: "option" });
  assert.deepEqual(await beantworte(n, { issue: "SIN-6", text: "x" }), { ok: false, grund: "unbekannt" });
  assert.equal(n.kommentare.length, 1);
  assert.equal((await beantworte(n, { issue: "SIN-5", text: "frei" })).ok, true);
});

test("beantworte meldet Linear-Fehler als Grund", async () => {
  const n = { ...netz(), beantworten: async () => Promise.reject(new Error("x")) };
  assert.deepEqual(await beantworte(n, { issue: "SIN-5", text: "frei" }), { ok: false, grund: "linear" });
});
