import assert from "node:assert/strict";
import { test } from "node:test";
import { bewerte, istBelegHaken, leseProbe, nurBelege } from "./belege";

test("nurBelege: nur wenn alle offenen Haken Belege sind", () => {
  assert.equal(nurBelege("- [ ] Zählung je Kurs\n- [ ] Run-Link\n- [x] Code"), true);
  assert.equal(nurBelege("- [ ] Zählung je Kurs\n- [ ] Code gebaut"), false);
  assert.equal(nurBelege("- [x] Zählung"), false);
  assert.equal(nurBelege(null), false);
});

test("istBelegHaken erkennt die vier Wörter", () => {
  for (const w of ["Zählung", "Run-Link", "Trockenlauf grün", "Beleg"]) assert.equal(istBelegHaken(w), true);
  assert.equal(istBelegHaken("Migration schreiben"), false);
});

test("leseProbe nimmt nur feste Proben, kein freies SQL", () => {
  assert.deepEqual(leseProbe("Zählung [probe:zaehlung:courses:9]"), { art: "zaehlung", tabelle: "courses", min: 9 });
  assert.deepEqual(leseProbe("Lauf [probe:run:abnahme.yml]"), { art: "run", workflow: "abnahme.yml" });
  assert.equal(leseProbe("[probe:zaehlung:courses; drop table x]"), null);
  assert.equal(leseProbe("kein Marker"), null);
});

test("bewerte: Zählung und Run", () => {
  assert.equal(bewerte({ art: "zaehlung", tabelle: "courses", min: 9 }, 9).belegt, true);
  assert.equal(bewerte({ art: "zaehlung", tabelle: "courses", min: 9 }, 3).belegt, false);
  assert.equal(bewerte({ art: "run", workflow: "a.yml" }, "failure").belegt, false);
});
