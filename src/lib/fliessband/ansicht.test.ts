import assert from "node:assert/strict";
import { test } from "node:test";
import { bahnen, kartenZeile, zeitleiste } from "./ansicht";
import type { Fliessband, Karte } from "./fliessband";
import type { LoopEvent } from "../uebersicht";

const karte = (issue: string, station: Karte["station"], farbe: Karte["farbe"], grund: string | null = null): Karte => ({
  issue, titel: `Titel ${issue}`, produkt: "lernapp", station, farbe, grund, seit: "2026-10-24T08:00:00Z", haken: null,
  links: { linear: `https://linear.app/x/${issue}`, pr: null, run: null },
});
const fb: Fliessband = {
  erzeugt: "2026-10-24T10:00:00Z",
  produkte: [
    { id: "lernapp", karten: [karte("SIN-1", "baut", "gruen"), karte("SIN-2", "pruefung", "rot", "Bewertungen fehlen"), karte("SIN-3", "baut", "blau"), karte("SIN-4", "fertig", "gruen")] },
    { id: "sjcode-website", karten: [karte("SIN-5", "fertig", "gruen")] },
    { id: "leitstand", karten: [] },
  ],
  brauchtDich: [],
  brauchtDichText: "Nichts – alles läuft",
};
const ev = (id: string, minuten: number, step: string, status: string, issue: string | null, project = "lernapp"): LoopEvent =>
  ({ id, created_at: new Date(Date.parse("2026-10-24T10:00:00Z") - minuten * 60_000).toISOString(), project, step, status, issue, pr: null, agent: null, cost: null }) as LoopEvent;

test("Test: je Produkt eine Bahn mit 8 Stationen; Karte zeigt SIN-Nummer, Titel, Grund, „seit …“ und Station als Pille; Fertig-Liste x/y", () => {
  const [lern, sj, leit] = bahnen(fb, [{ project: "lernapp", fertig: 4, gesamt: 7, neueIdeen: 0 }, { project: "sjcode-website", fertig: 5, gesamt: 5, neueIdeen: 0 }]);
  assert.equal(lern.punkte.length, 8);
  assert.deepEqual(lern.punkte.map((p) => p.anzahl), [0, 2, 0, 1, 0, 0, 0, 1]);
  // Baut: blau schlägt grün; Prüfung rot.
  assert.equal(lern.punkte[1].farbe, "blau");
  assert.equal(lern.punkte[3].farbe, "rot");
  assert.equal(lern.punkte[0].farbe, null);
  // Offene Karten ohne „Fertig“, rot zuerst.
  assert.deepEqual(lern.offen.map((k) => k.issue), ["SIN-2", "SIN-3", "SIN-1"]);
  assert.deepEqual(lern.fertigListe, { fertig: 4, gesamt: 7 });
  assert.equal(kartenZeile(lern.offen[0], "vor 2 Stunden"), "Bewertungen fehlen · seit 2 Stunden");
  assert.equal(kartenZeile(lern.offen[2], null), "läuft");
  assert.equal(sj.leerText, "Alles fertig und live. Nichts zu tun.");
  assert.equal(leit.fertigListe, null);
  assert.equal(leit.leerText, "Gerade nichts in Arbeit.");
});

test("Zeitleiste: Merges und rote Schritte der letzten 12 h, neueste zuerst, ältere fallen weg", () => {
  const liste = zeitleiste(
    [ev("a", 30, "merge", "ok", "SIN-1"), ev("b", 90, "worker", "fehler", "SIN-2"), ev("c", 60, "worker", "ok", "SIN-3"), ev("d", 13 * 60, "merge", "ok", "SIN-4"), ev("e", 40, "merge", "ok", "SIN-1")],
    fb,
    (id) => (id === "lernapp" ? "Lern-App" : id),
    new Date("2026-10-24T10:00:00Z"),
  );
  assert.deepEqual(liste.map((z) => [z.farbe, z.text]), [
    ["gruen", "Lern-App: Titel SIN-1 gemergt"],
    ["rot", "Lern-App: Titel SIN-2 rot bei worker"],
  ]);
});
