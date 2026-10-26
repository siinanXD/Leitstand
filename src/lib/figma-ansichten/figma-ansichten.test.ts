import assert from "node:assert/strict";
import { test } from "node:test";
import { figmaLink, leseRegister, pruefeRegister } from "./figma-ansichten";

const ok = { titel: "A", datei: "abc", node: "1:2", art: "diagramm", produkt: "leitstand" };

test("Register enthält Ablauf, Ablauf nach Agent und Abhängigkeiten", () => {
  const nodes = leseRegister().map((a) => a.node);
  for (const n of ["21:2", "47:28", "15:1662"]) assert.ok(nodes.includes(n), n);
});

test("pruefeRegister: gültiger Eintrag, Pflichtfelder, Node-ID, Art, Doppelte", () => {
  assert.equal(pruefeRegister({ ansichten: [ok] }).length, 1);
  assert.throws(() => pruefeRegister({}), /ansichten/);
  assert.throws(() => pruefeRegister({ ansichten: [{ ...ok, titel: " " }] }), /Pflichtfeld/);
  assert.throws(() => pruefeRegister({ ansichten: [{ ...ok, node: "12-3" }] }), /Node-ID/);
  assert.throws(() => pruefeRegister({ ansichten: [{ ...ok, art: "foto" }] }), /Art/);
  assert.throws(() => pruefeRegister({ ansichten: [ok, ok] }), /doppelt/);
});

test("figmaLink nutzt die Node-ID mit Bindestrich", () => {
  assert.equal(figmaLink(ok), "https://www.figma.com/design/abc?node-id=1-2");
});
