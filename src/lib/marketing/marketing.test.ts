import assert from "node:assert/strict";
import { test } from "node:test";
import { leseAusgaben, promptFuer, wartenSatz, werbemittelZeilen, type Eingabe } from "./marketing";

// Fixture: so sieht eine gültige Modellantwort aus.
const FIXTURE = {
  landingPage: { titel: "Prüfungsvorbereitung ohne Zettelwirtschaft", text: "Für Ausbilder bei Bildungsträgern: Lernstand je Azubi auf einen Blick." },
  anzeigen: [
    { plattform: "google", ueberschrift: "IHK-Lernstand im Blick", text: "Demo anfragen.", zielgruppe: "Ausbildungsleiter im Mittelstand", budgetEurProWoche: 70 },
    { plattform: "meta", ueberschrift: "Azubis lernen gezielter", text: "Kurze Einheiten.", zielgruppe: "Ausbilder, 30–55", budgetEurProWoche: 40 },
    { plattform: "linkedin", ueberschrift: "Weniger Durchfaller", text: "So geht IHK-Vorbereitung.", zielgruppe: "Bildungsleitung", budgetEurProWoche: 90 },
  ],
  leadMagnet: { titel: "Checkliste: 10 Wochen bis zur IHK-Prüfung", text: "Ein Wochenplan als PDF." },
  clipAuftrag: { prompt: "Ausbilderin zeigt Lernstand auf dem Tablet", dauerSekunden: 15 },
  metricoolEntwurf: { text: "Neu: Lernstand je Azubi. Demo anfragen." },
};

const eingabe: Eingabe = { produkt: "Lern-App", beschreibung: "Lernplattform für IHK-Ausbildung", kennzahlen: { besuche: 400, demoAnfragen: 3, abbrueche: 120 }, vorherige: [], konkurrenz: [] };

test("Fixture ergibt die 5 Ausgaben als 7 Zeilen, alle wartend", () => {
  const a = leseAusgaben(FIXTURE);
  assert.ok(a);
  const z = werbemittelZeilen("Lern-App", a);
  assert.deepEqual(z.map((x) => x.art), ["landing_page", "anzeige", "anzeige", "anzeige", "lead_magnet", "clip_auftrag", "metricool_entwurf"]);
  assert.ok(z.every((x) => x.status === "wartet_auf_freigabe" && x.mit_ki));
  assert.match(z[1].text_inhalt, /Zielgruppe: .*\nBudgetvorschlag: 70 €/);
});

test("Unvollständige oder ungültige Antwort wird abgelehnt", () => {
  assert.equal(leseAusgaben(null), null);
  assert.equal(leseAusgaben({ ...FIXTURE, anzeigen: FIXTURE.anzeigen.slice(0, 2) }), null);
  assert.equal(leseAusgaben({ ...FIXTURE, anzeigen: FIXTURE.anzeigen.map((x) => ({ ...x, budgetEurProWoche: -1 })) }), null);
  assert.equal(leseAusgaben({ ...FIXTURE, clipAuftrag: { prompt: "x", dauerSekunden: 600 } }), null);
  assert.equal(leseAusgaben({ ...FIXTURE, metricoolEntwurf: { text: "  " } }), null);
});

test("Prompt nennt Zahlen nur, wenn gemessen", () => {
  assert.match(promptFuer(eingabe), /Demo-Anfragen 3/);
  assert.match(promptFuer({ ...eingabe, kennzahlen: null }), /keine Kennzahlen verfügbar/);
});

test("Kachel-Satz", () => {
  assert.equal(wartenSatz(0), "Nichts wartet");
  assert.equal(wartenSatz(1), "1 Entwurf wartet");
  assert.equal(wartenSatz(3), "3 Entwürfe warten");
});
