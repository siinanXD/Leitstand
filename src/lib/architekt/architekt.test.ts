import assert from "node:assert/strict";
import { test } from "node:test";
import { bewerteSeite, inFertigListe, pruefeUrteile, type Seite } from "./architekt";

const seite = (s: Partial<Seite>): Seite => ({ pfad: "/kosten", inFertigListe: false, ...s });

test("ohne Aufrufe und nicht in der Fertig-Liste: entfernen", () => {
  const u = bewerteSeite(seite({ aufrufe: 0 }));
  assert.equal(u.urteil, "entfernen");
  assert.match(u.beleg, /^0 Aufrufe/);
});

test("Seite in der Fertig-Liste wird nie entfernt", () => {
  assert.equal(bewerteSeite(seite({ aufrufe: 0, inFertigListe: true })).urteil, "behalten");
  assert.equal(bewerteSeite(seite({ inFertigListe: true })).urteil, "behalten");
});

test("fehlende Analytics: keine Daten, kein entfernen", () => {
  const u = bewerteSeite(seite({}));
  assert.equal(u.urteil, "keine_daten");
  assert.equal(u.beleg, "Analytics fehlen");
});

test("genutzte Seite bleibt, mit Zielseite wird sie zusammengelegt", () => {
  assert.equal(bewerteSeite(seite({ aufrufe: 12 })).urteil, "behalten");
  const u = bewerteSeite(seite({ aufrufe: 2, zusammenMit: "/details" }));
  assert.equal(u.urteil, "zusammenlegen");
  assert.equal(u.mit, "/details");
});

test("pruefeUrteile lehnt unbelegtes entfernen, fremde Seiten und Zusammenlegen ohne Ziel ab", () => {
  const seiten = [seite({ aufrufe: 5 }), seite({ pfad: "/team", inFertigListe: true, aufrufe: 0 }), seite({ pfad: "/ablauf" })];
  const u = (pfad: string, urteil: "entfernen" | "zusammenlegen") => ({ pfad, urteil, grund: "x", beleg: "y" });
  assert.deepEqual(pruefeUrteile([u("/kosten", "entfernen"), u("/team", "entfernen"), u("/ablauf", "entfernen"), u("/nix", "entfernen"), u("/kosten", "zusammenlegen")], seiten), [
    "/kosten: entfernen nicht belegt",
    "/team: entfernen nicht belegt",
    "/ablauf: entfernen nicht belegt",
    "/nix: Seite nicht in der Routenliste",
    "/kosten: zusammenlegen ohne Ziel",
  ]);
});

test("inFertigListe findet den Pfad ohne Beispiel-Kennung; die Startseite nie", () => {
  assert.ok(inFertigListe("/projekt/leitstand", "- Seite /projekt zeigt"));
  assert.ok(!inFertigListe("/kosten", "- Zeigt Kosten"));
  assert.ok(!inFertigListe("/", "alles /x"));
});
