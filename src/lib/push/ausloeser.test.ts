import assert from "node:assert/strict";
import { test } from "node:test";
import { abbruchAus, alarmeAus, auswertungsSchluessel, berlinZeit, brauchtDich, brauchtDichAus, fertigAus, inRuhe, menschlich, plane, spaeter, stillstandAus, type Ereignis } from "./ausloeser";

const utc = (s: string) => Date.parse(s);
const e = (id: string, art: Ereignis["art"], zeit: number, extra: Partial<Ereignis> = {}): Ereignis => ({ id, art, projekt: "Leitstand", kennung: "SIN-1", titel: "Freigabe offen", zeit, ...extra });

test("Regel 1: Braucht dich kommt sofort, mit Projekt und Kennung vorne und Bereichen", () => {
  const jetzt = utc("2026-10-12T10:00:00Z");
  const p = plane([e("a", "braucht-dich", jetzt, { bereiche: ["Frontend", "Datenbank", "Infrastruktur"] })], new Set(), jetzt);
  assert.equal(p.nachrichten.length, 1);
  assert.equal(p.nachrichten[0].titel, "Braucht dich");
  assert.equal(p.nachrichten[0].text, "Leitstand SIN-1: Freigabe offen\nÄndert Datenbank, Infrastruktur, Frontend");
  assert.ok(p.nachrichten[0].text.split("\n").length <= 2);
  assert.deepEqual(p.neu, ["a"]);
});

test("Regel 1: Aufgaben zählen nur mit Label sinan", () => {
  assert.equal(brauchtDich({ id: "1", art: "aufgabe", labels: ["claude"] }), false);
  assert.equal(brauchtDich({ id: "1", art: "aufgabe", labels: ["sinan"] }), true);
  assert.equal(brauchtDich({ id: "1", art: "freigabe" }), true);
  assert.equal(brauchtDich({ id: "1", art: "entscheidung" }), true);
});

test("Regel 2: Alarm kommt auch um 03:00, Braucht dich wartet bis 07:00", () => {
  const nacht = utc("2026-10-13T01:00:00Z"); // 03:00 MESZ
  assert.equal(berlinZeit(nacht).stunde, 3);
  const ereignisse = [e("alarm1", "alarm", nacht), e("b1", "braucht-dich", nacht), e("b2", "braucht-dich", nacht, { kennung: "SIN-2" })];
  const p3 = plane(ereignisse, new Set(), nacht);
  assert.equal(p3.nachrichten.length, 1);
  assert.equal(p3.nachrichten[0].titel, "Alarm");
  assert.deepEqual(p3.neu, ["alarm1"]);
  const gesendet = new Set(p3.neu);
  assert.equal(plane(ereignisse, gesendet, utc("2026-10-13T04:00:00Z")).nachrichten.length, 0); // 06:00
  const p7 = plane(ereignisse, gesendet, utc("2026-10-13T05:00:00Z")); // 07:00
  assert.equal(p7.nachrichten.length, 1);
  assert.equal(p7.nachrichten[0].titel, "Braucht dich (2)");
  assert.deepEqual(p7.neu, ["b1", "b2"]);
});

test("Regel 2: Alarme aus der Lage (Produktion, main, Loop länger als 30 Minuten)", () => {
  const jetzt = utc("2026-10-12T10:00:00Z");
  assert.equal(alarmeAus({}, "Leitstand", jetzt).length, 0);
  assert.equal(alarmeAus({ letzterLoopLauf: jetzt - 30 * 60_000 }, "Leitstand", jetzt).length, 0);
  assert.equal(alarmeAus({ letzterLoopLauf: jetzt - 31 * 60_000 }, "Leitstand", jetzt).length, 1);
  assert.equal(alarmeAus({ produktionDownSeit: jetzt - 1, mainRotSeit: jetzt - 2 }, "Leitstand", jetzt).length, 2);
});

test("Regel 3: Testlauf stündlich über 48 Stunden schickt je Tag genau eine Auswertung um 20:00", () => {
  const gesendet = new Set<string>();
  const stunden: number[] = [];
  for (let h = 0; h < 48; h++) {
    const jetzt = utc("2026-07-10T00:00:00Z") + h * 3600_000;
    const p = plane([], gesendet, jetzt);
    for (const n of p.nachrichten) if (n.titel === "Auswertung") stunden.push(berlinZeit(jetzt).stunde);
    p.neu.forEach((k) => gesendet.add(k));
  }
  assert.deepEqual(stunden, [20, 20]);
});

test("Regel 3: Auswertung nicht doppelt bei zwei Läufen in derselben Stunde", () => {
  const jetzt = utc("2026-07-10T18:05:00Z"); // 20:05 MESZ
  const erst = plane([], new Set(), jetzt);
  assert.equal(erst.nachrichten.length, 1);
  assert.deepEqual(erst.neu, [auswertungsSchluessel("2026-07-10")]);
  assert.equal(plane([], new Set(erst.neu), jetzt + 20 * 60_000).nachrichten.length, 0);
});

test("Zeitumstellung: 20:00 Berlin im Sommer (18 UTC) und Winter (19 UTC)", () => {
  assert.equal(berlinZeit(utc("2026-07-10T18:30:00Z")).stunde, 20);
  assert.equal(berlinZeit(utc("2026-07-10T19:30:00Z")).stunde, 21);
  assert.equal(berlinZeit(utc("2026-12-10T19:30:00Z")).stunde, 20);
  assert.equal(berlinZeit(utc("2026-12-10T18:30:00Z")).stunde, 19);
  assert.equal(plane([], new Set(), utc("2026-12-10T19:30:00Z")).nachrichten.length, 1);
  assert.equal(plane([], new Set(), utc("2026-12-10T18:30:00Z")).nachrichten.length, 0);
});

test("Zeitumstellung: Umstellungstage 29. März und 25. Oktober 2026", () => {
  assert.equal(berlinZeit(utc("2026-03-28T19:00:00Z")).stunde, 20); // noch Winterzeit
  assert.equal(berlinZeit(utc("2026-03-29T18:00:00Z")).stunde, 20); // schon Sommerzeit
  assert.equal(berlinZeit(utc("2026-03-29T19:00:00Z")).stunde, 21);
  assert.equal(berlinZeit(utc("2026-10-25T18:00:00Z")).stunde, 19);
  assert.equal(berlinZeit(utc("2026-10-25T19:00:00Z")).stunde, 20); // Winterzeit
  assert.equal(inRuhe(utc("2026-03-29T04:59:00Z")), true); // 06:59 MESZ
  assert.equal(inRuhe(utc("2026-03-29T05:00:00Z")), false); // 07:00 MESZ
  assert.equal(inRuhe(utc("2026-03-28T05:59:00Z")), true); // 06:59 MEZ
  assert.equal(inRuhe(utc("2026-03-28T06:00:00Z")), false); // 07:00 MEZ
});

test("Regel 4: Selbst behoben nie einzeln, nur in der Auswertung", () => {
  const behoben = e("sb1", "selbst-behoben", utc("2026-07-10T08:00:00Z"), { bereiche: ["Backend"] });
  assert.equal(plane([behoben], new Set(), utc("2026-07-10T10:00:00Z")).nachrichten.length, 0);
  const p = plane([behoben], new Set(), utc("2026-07-10T18:00:00Z"));
  assert.equal(p.nachrichten.length, 1);
  assert.equal(p.nachrichten[0].text, "1 selbst behoben, 0 warten auf dich\nÄndert Backend");
  assert.ok(p.neu.includes("sb1"));
  const naechster = plane([behoben], new Set(p.neu), utc("2026-07-11T18:00:00Z"));
  assert.equal(naechster.nachrichten[0].text, "0 selbst behoben, 0 warten auf dich");
});

test("Regel 5: Ruhe 22:00 bis 07:00, der Rest kommt um 07:00", () => {
  assert.equal(inRuhe(utc("2026-07-10T19:59:00Z")), false); // 21:59
  assert.equal(inRuhe(utc("2026-07-10T20:00:00Z")), true); // 22:00
  assert.equal(inRuhe(utc("2026-07-11T04:59:00Z")), true); // 06:59
  assert.equal(inRuhe(utc("2026-07-11T05:00:00Z")), false); // 07:00
  const zeit = utc("2026-07-10T21:00:00Z"); // 23:00
  assert.equal(plane([e("n1", "braucht-dich", zeit)], new Set(), zeit).nachrichten.length, 0);
  const morgens = plane([e("n1", "braucht-dich", zeit)], new Set(), utc("2026-07-11T05:00:00Z"));
  assert.equal(morgens.nachrichten.length, 1);
  assert.equal(morgens.nachrichten[0].titel, "Braucht dich");
});

test("Regel 6: Bereiche in fester Reihenfolge; ohne Bereiche keine zweite Zeile", () => {
  const jetzt = utc("2026-10-12T10:00:00Z");
  const mit = plane([e("a", "alarm", jetzt, { bereiche: ["Frontend", "Datenbank"] })], new Set(), jetzt);
  assert.equal(mit.nachrichten[0].text.split("\n")[1], "Ändert Datenbank, Frontend");
  const ohne = plane([e("b", "alarm", jetzt)], new Set(), jetzt);
  assert.equal(ohne.nachrichten[0].text.includes("\n"), false);
});

test("Keine doppelte Mitteilung für dasselbe Ereignis", () => {
  const jetzt = utc("2026-10-12T10:00:00Z");
  const ereignis = e("a", "braucht-dich", jetzt);
  const p = plane([ereignis, ereignis], new Set(), jetzt);
  assert.equal(p.nachrichten.length, 1);
  assert.equal(plane([ereignis], new Set(p.neu), jetzt + 3600_000).nachrichten.length, 0);
});

test("Später: Erinnerung nach 1 Stunde, einmal", () => {
  const jetzt = utc("2026-10-12T10:00:00Z");
  const ereignis = e("a", "braucht-dich", jetzt);
  const r = spaeter(ereignis, jetzt);
  assert.equal(r.faelligAb, jetzt + 3600_000);
  const gesendet = new Set(["a"]);
  assert.equal(plane([ereignis], gesendet, jetzt + 3599_000, [r]).nachrichten.length, 0);
  const p = plane([ereignis], gesendet, jetzt + 3600_000, [r]);
  assert.equal(p.nachrichten.length, 1);
  assert.equal(p.nachrichten[0].titel, "Erinnerung: Braucht dich");
  assert.equal(plane([ereignis], new Set([...gesendet, ...p.neu]), jetzt + 7200_000, [r]).nachrichten.length, 0);
});

test("Quellen: Wartendes wird Braucht dich ohne Kennung im Text, gleiche Karte nur einmal", () => {
  const jetzt = utc("2026-10-13T12:00:00Z");
  const ereignisse = brauchtDichAus([{ key: "leitstand#108", titel: "PostHog-Prüfung freigeben", projekt: "Leitstand" }], jetzt);
  const p = plane(ereignisse, new Set(), jetzt);
  assert.equal(p.nachrichten[0].text, "Leitstand: PostHog-Prüfung freigeben");
  assert.deepEqual(p.neu, ["braucht:leitstand#108"]);
  assert.equal(plane(ereignisse, new Set(p.neu), jetzt + 3_600_000).nachrichten.length, 0);
});

test("Quellen: Stillstand nur mit startbarer Arbeit, ohne Lauf, ohne Pause, nach 30 Minuten", () => {
  const jetzt = utc("2026-10-13T12:00:00Z");
  const basis = { projekt: "Content-Agent-Lernapp", name: "Lern-App", startbar: 1, laeuft: 0, pausiert: false, letztesEreignis: jetzt - 31 * 60_000 };
  assert.equal(stillstandAus([basis], jetzt).length, 1);
  assert.equal(stillstandAus([basis], jetzt)[0].art, "braucht-dich");
  assert.equal(stillstandAus([{ ...basis, startbar: 0 }], jetzt).length, 0);
  assert.equal(stillstandAus([{ ...basis, laeuft: 1 }], jetzt).length, 0);
  assert.equal(stillstandAus([{ ...basis, pausiert: true }], jetzt).length, 0);
  assert.equal(stillstandAus([{ ...basis, letztesEreignis: jetzt - 10 * 60_000 }], jetzt).length, 0);
});

test("Gebündelt ohne Kennung nennt die Titel", () => {
  const nacht = utc("2026-10-13T01:00:00Z");
  const ereignisse = brauchtDichAus([{ key: "a", titel: "Clip freigeben", projekt: "Lern-App" }, { key: "b", titel: "Repo anlegen", projekt: "Leitstand" }], nacht);
  const p = plane(ereignisse, new Set(), utc("2026-10-13T05:00:00Z"));
  assert.equal(p.nachrichten[0].text, "Lern-App, Leitstand: Clip freigeben, Repo anlegen");
});

test("Fertig: nur feat und fix der letzten 6 Stunden, Titel ohne Präfix und Kennung", () => {
  const jetzt = utc("2026-10-13T15:40:00Z");
  const prs = [
    { repo: "siinanXD/Leitstand", projekt: "Leitstand", nummer: 118, titel: "feat(einfach): Leiste unten, nichts scrollt seitlich (SIN-578)", gemergt: utc("2026-10-13T15:29:00Z") },
    { repo: "siinanXD/Leitstand", projekt: "Leitstand", nummer: 116, titel: "docs(steuerung): Regel (SIN-577)", gemergt: utc("2026-10-13T14:13:00Z") },
    { repo: "siinanXD/Leitstand", projekt: "Leitstand", nummer: 90, titel: "fix(alt): längst gemeldet (SIN-1)", gemergt: utc("2026-10-13T08:00:00Z") },
  ];
  const ereignisse = fertigAus(prs, jetzt);
  assert.deepEqual(ereignisse.map((e) => e.id), ["fertig:siinanXD/Leitstand#118"]);
  const p = plane(ereignisse, new Set(), jetzt);
  assert.equal(p.nachrichten[0].titel, "Fertig und live");
  assert.equal(p.nachrichten[0].text, "Leitstand: Leiste unten, nichts scrollt seitlich");
  assert.equal(menschlich("chore: aufräumen"), "Aufräumen");
});

test("Abbruch: letzter echter Lauf gescheitert, einmal am Tag, nicht wenn danach einer klappte", () => {
  const jetzt = utc("2026-10-13T15:30:00Z");
  const lauf = (ergebnis: string, min: number, issue = "SIN-456") => ({ repo: "siinanXD/Content-Agent-Lernapp", projekt: "Lern-App", issue, titel: "Richter prüft Fakten", ergebnis, ende: jetzt - min * 60_000 });
  assert.equal(abbruchAus([lauf("failure", 20), lauf("failure", 10), lauf("skipped", 5)], jetzt).length, 1);
  assert.equal(abbruchAus([lauf("failure", 20), lauf("success", 10)], jetzt).length, 0);
  assert.equal(abbruchAus([lauf("failure", 90)], jetzt).length, 0);
  const a = abbruchAus([lauf("failure", 20)], jetzt);
  const b = abbruchAus([lauf("failure", 3)], jetzt);
  assert.equal(a[0].id, b[0].id);
  const p = plane(a, new Set(), jetzt);
  assert.equal(p.nachrichten[0].titel, "Worker abgebrochen");
  assert.equal(p.nachrichten[0].text, "Lern-App: Richter prüft Fakten");
});

test("Nachts gesammelt: gemischte Arten heißen „Neues“, Auswertung zählt nur Braucht dich", () => {
  const nacht = utc("2026-10-13T01:00:00Z");
  const ereignisse = [e("b1", "braucht-dich", nacht), e("f1", "fertig", nacht, { titel: "Leiste unten", kennung: "" })];
  assert.equal(plane(ereignisse, new Set(), nacht).nachrichten.length, 0);
  const p7 = plane(ereignisse, new Set(), utc("2026-10-13T05:00:00Z"));
  assert.equal(p7.nachrichten[0].titel, "Neues (2)");
});

test("Tagsüber mehr als drei auf einmal: eine gesammelte Mitteilung", () => {
  const jetzt = utc("2026-10-13T15:40:00Z");
  const viele = ["a", "b", "c", "d"].map((id) => e(id, "fertig", jetzt, { kennung: "", titel: `Teil ${id}` }));
  const p = plane(viele, new Set(), jetzt);
  assert.equal(p.nachrichten.length, 1);
  assert.equal(p.nachrichten[0].titel, "Fertig und live (4)");
  assert.deepEqual(p.neu, ["a", "b", "c", "d"]);
});
