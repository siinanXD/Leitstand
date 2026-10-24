import assert from "node:assert/strict";
import { test } from "node:test";
import { findeMuster } from "./muster";

test("findeMuster findet verbotene Muster", () => {
  assert.equal(findeMuster("Lorem ipsum dolor")[0].id, "platzhalter");
  assert.equal(findeMuster("Entdecke die Möglichkeiten")[0].id, "ki-floskel");
  assert.equal(findeMuster("## 🚀 Start")[0].id, "emoji-ueberschrift");
  assert.equal(findeMuster("background: linear-gradient(90deg, purple, blue)")[0].id, "lila-verlauf");
  assert.equal(findeMuster("Coming soon")[0].id, "coming-soon");
});

test("findeMuster lässt sauberen Text durch", () => {
  assert.deepEqual(findeMuster("## Heute in einem Satz\n3 Aufgaben offen."), []);
});

test("findeMuster meldet Namenskürzel, nicht sprechende Namen", () => {
  assert.equal(findeMuster("const tmp = 1;")[0].id, "kuerzel-name");
  assert.equal(findeMuster("let data2 = lade();")[0].id, "kuerzel-name");
  assert.deepEqual(findeMuster("const projekte = ladeProjekte();"), []);
});
