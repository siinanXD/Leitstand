import assert from "node:assert/strict";
import { test } from "node:test";
import { entscheide, type ProduktLage } from "../ceo/ceo";
import { brauchtGo, fokusVon, goEingabe, goSatz, haelt, pruefeVersion, staende, standZeile, versionAbschnitt, vorschlagText, type Version } from "./visionaer";

const fertigLage: ProduktLage = { id: "lernapp", name: "Lern-App", startbar: 0, fertig: 10, gesamt: 10, rot: null, wartetAufSinan: [], metaPrsHeute: 0, ideenDieseWoche: 0 };
const version: Version = { name: "v2 Prüfungsmodus", ziel: "Azubis üben unter Prüfungsbedingungen.", fertig_punkte: ["Zeitlimit", "Auswertung", "Fehlerliste"], nicht_ziele: [], tage: 12, voraussetzung: "", nur_fehler: false, idee_issues: [] };
const ereignis = (project: string, status: string, created_at: string, grund = "") => ({ project, step: "VERSION", status, grund, created_at });

test("Fertig-Liste 100 %: CEO sagt fertig und ruft den Visionär; mit Go baut er wieder; ohne Go nicht", () => {
  const erst = entscheide(fertigLage);
  assert.equal(erst.art, "fertig");
  assert.equal(erst.visionaer, true);
  // Zweiter Lauf, Vorschlag liegt vor, aber kein Go: nichts bauen, nichts auffüllen, Visionär nicht noch einmal rufen.
  for (const v of ["pause", "vorschlag"] as const) {
    const zweit = entscheide({ ...fertigLage, version: v });
    assert.equal(zweit.art, "fertig");
    assert.equal(zweit.auffuellen, 0);
    assert.equal(zweit.visionaer, false);
  }
  const mitGo = entscheide({ ...fertigLage, version: "go" });
  assert.equal(mitGo.art, "weiterbauen");
  assert.equal(mitGo.auffuellen, 8);
});

test("Rot geht vor fertig; Fokus beschränkt andere Produkte auf Reparaturen", () => {
  assert.equal(entscheide({ ...fertigLage, rot: "Sentry" }).art, "weiterbauen");
  const fokus = entscheide({ ...fertigLage, fertig: 3, fokusBei: "leitstand" });
  assert.equal(fokus.art, "warten");
  assert.equal(fokus.auffuellen, 0);
  assert.equal(entscheide({ ...fertigLage, fertig: 3, rot: "Sentry", fokusBei: "leitstand" }).art, "weiterbauen");
});

test("Stand: jüngstes VERSION-Ereignis je Produkt; Dispatcher hält bei pause und vorschlag", () => {
  const s = staende([
    ereignis("lernapp", "pause", "2026-10-13T06:00:00Z"),
    ereignis("lernapp", "vorschlag", "2026-10-13T06:05:00Z", "v2 Prüfungsmodus"),
    { project: "lernapp", step: "PAUSE", status: "pausiert", created_at: "2026-10-13T07:00:00Z" },
    ereignis("leitstand", "unsinn", "2026-10-13T06:00:00Z"),
  ]);
  assert.deepEqual(s, [{ produkt: "lernapp", status: "vorschlag", name: "v2 Prüfungsmodus", seit: "2026-10-13T06:05:00Z" }]);
  assert.equal(haelt(s[0]), true);
  assert.equal(haelt(staende([ereignis("lernapp", "go", "2026-10-13T08:00:00Z")])[0]), false);
  assert.equal(haelt(undefined), false);
  assert.deepEqual(staende(null), []);
  assert.deepEqual(standZeile("lernapp", "go", "v2 Prüfungsmodus"), { project: "lernapp", step: "VERSION", status: "go", grund: "v2 Prüfungsmodus", issue: null, pr: null });
});

test("Fokus-Regel: freigegebene Version hält andere Produkte 14 Tage auf Reparaturen", () => {
  const s = staende([ereignis("leitstand", "go", "2026-10-01T00:00:00Z", "v2 Details")]);
  assert.equal(fokusVon(s, "lernapp", new Date("2026-10-10T00:00:00Z")), "leitstand");
  assert.equal(fokusVon(s, "leitstand", new Date("2026-10-10T00:00:00Z")), null);
  assert.equal(fokusVon(s, "lernapp", new Date("2026-10-16T00:00:00Z")), null);
  assert.equal(fokusVon(staende([ereignis("leitstand", "fertig", "2026-10-01T00:00:00Z")]), "lernapp", new Date("2026-10-02T00:00:00Z")), null);
});

test("Version: 3 bis 7 Punkte, Name v<N> <Name>, nie zwei offene", () => {
  assert.deepEqual(pruefeVersion(version, null), []);
  assert.match(pruefeVersion({ ...version, fertig_punkte: ["a", "b"] }, null).join(), /3 bis 7/);
  assert.match(pruefeVersion({ ...version, name: "Prüfungsmodus" }, null).join(), /v2/);
  assert.match(pruefeVersion(version, "v2 Anderes").join(), /noch offen/);
  assert.match(pruefeVersion({ ...version, tage: 0 }, null).join(), /Tage/);
});

test("VERSIONEN.md-Abschnitt, Go-Satz, Go nur für Funktionen und Eingabe-Prüfung", () => {
  const md = versionAbschnitt(version);
  assert.match(md, /^## v2 Prüfungsmodus\n/);
  assert.match(md, /- \[ \] Zeitlimit/);
  assert.match(md, /12 Tage \(Schätzung\)/);
  assert.equal(vorschlagText(version), "v2 Prüfungsmodus, 12 Tage");
  assert.equal(goSatz("Lern-App", vorschlagText(version)), "Der Chef sagt: Lern-App ist fertig. Vorschlag v2 Prüfungsmodus, 12 Tage. Go?");
  assert.equal(brauchtGo(version), true);
  assert.equal(brauchtGo({ nur_fehler: true }), false);
  assert.deepEqual(goEingabe({ produkt: "lernapp", go: true }, ["lernapp"]), { produkt: "lernapp" });
  assert.equal(goEingabe({ produkt: "lernapp", go: false }, ["lernapp"]), null);
  assert.equal(goEingabe({ produkt: "x", go: true }, ["lernapp"]), null);
  assert.equal(goEingabe(null, ["lernapp"]), null);
});
