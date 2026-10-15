import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEvents, parseSnapshot, type Quelle } from "./uebersicht";
import { datenStand, veraltet } from "./veraltet";

const jetzt = new Date("2026-10-14T23:30:00Z");
const snap = (updated_at: string) => parseSnapshot([{ project: "leitstand", stage: "WORK", status: "running", title: "x", updated_at, issue: "SIN-1" }]);
const dispatch = (created_at: string) => parseEvents([{ id: created_at, created_at, project: "leitstand", step: "dispatch", status: "ok", issue: null }]);
const quelle = (snapshot: Quelle["snapshot"], events: Quelle["events"] = []): Quelle => ({ events, snapshot });

test("künstlich alter Snapshot (18:51 Berlin-Vortag-Fall) zeigt die Warnung", () => {
  const w = veraltet(quelle(snap("2026-10-14T16:51:00Z")), jetzt);
  assert.deepEqual(w, { art: "snapshot", seit: "2026-10-14T16:51:00Z" });
});

test("frischer Snapshot und frischer Dispatcher: keine Warnung", () => {
  assert.equal(veraltet(quelle(snap("2026-10-14T23:10:00Z"), dispatch("2026-10-14T22:00:00Z")), jetzt), null);
});

test("Dispatcher seit über 2 Stunden ohne Lauf zeigt die Warnung", () => {
  const w = veraltet(quelle(snap("2026-10-14T23:20:00Z"), dispatch("2026-10-14T21:00:00Z")), jetzt);
  assert.deepEqual(w, { art: "dispatcher", seit: "2026-10-14T21:00:00Z" });
});

test("Pause und leere Daten warnen nie", () => {
  assert.equal(veraltet(quelle(snap("2026-10-14T10:00:00Z")), jetzt, true), null);
  assert.equal(veraltet(quelle([]), jetzt), null);
});

test("datenStand nimmt den jüngsten Zeitstempel", () => {
  const s = [...snap("2026-10-14T10:00:00Z"), ...snap("2026-10-14T12:00:00Z")];
  assert.equal(datenStand(quelle(s)), "2026-10-14T12:00:00Z");
});
