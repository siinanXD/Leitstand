import assert from "node:assert/strict";
import { test } from "node:test";
import { istWiederholung } from "./wiederholung";

const jetzt = new Date("2026-10-22T12:00:00Z");
const vor = (h: number) => new Date(jetzt.getTime() - h * 3_600_000).toISOString();
const skip = { step: "dispatch", status: "uebersprungen", grund: "keine_todo: kein Todo-Issue" };

test("Leerlauf: gleicher Grund innerhalb von 6 h wird nicht erneut gespeichert", () => {
  assert.equal(istWiederholung({ status: "uebersprungen", grund: skip.grund, created_at: vor(1) }, skip, jetzt), true);
  assert.equal(istWiederholung({ status: "ok", grund: "haenger", created_at: vor(1) }, { step: "platz", status: "ok", grund: "haenger" }, jetzt), true);
});

test("Leerlauf: neuer Grund, neuer Status, nach 6 h oder ohne Vorgänger wird gespeichert", () => {
  assert.equal(istWiederholung({ status: "uebersprungen", grund: "scope_konflikt: x", created_at: vor(1) }, skip, jetzt), false);
  assert.equal(istWiederholung({ status: "ok", grund: null, created_at: vor(1) }, skip, jetzt), false);
  assert.equal(istWiederholung({ status: "uebersprungen", grund: skip.grund, created_at: vor(7) }, skip, jetzt), false);
  assert.equal(istWiederholung(null, skip, jetzt), false);
});

test("Leerlauf: Fehler und Starts werden immer gespeichert", () => {
  const f = { step: "dispatch", status: "fehler", grund: "x" };
  assert.equal(istWiederholung({ status: "fehler", grund: "x", created_at: vor(0.1) }, f, jetzt), false);
  assert.equal(istWiederholung({ status: "ok", grund: null, created_at: vor(0.1) }, { step: "dispatch", status: "ok", grund: null }, jetzt), false);
  // platz: nur das wiederholte „ok“ (Platz freigegeben) entfällt, nie Start oder Fehler
  assert.equal(istWiederholung({ status: "fehler", grund: "x", created_at: vor(0.1) }, { step: "platz", status: "fehler", grund: "x" }, jetzt), false);
  assert.equal(istWiederholung({ status: "start", grund: null, created_at: vor(0.1) }, { step: "platz", status: "start", grund: null }, jetzt), false);
});
