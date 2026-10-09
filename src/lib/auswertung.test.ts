import assert from "node:assert/strict";
import { test } from "node:test";
import { auswertungSatz, bereicheSumme, merges, zahlen } from "./auswertung";
import { parseEvents, parseSnapshot } from "./uebersicht";

const jetzt = new Date("2026-10-09T12:00:00Z");
const vor = (h: number) => new Date(jetzt.getTime() - h * 3_600_000).toISOString();
const ev = (rows: object[]) => parseEvents(rows.map((r) => ({ created_at: vor(1), ...r })));

test("merges zählt heutige Merges je PR einmal, gestern nicht", () => {
  const e = ev([
    { project: "leitstand", step: "merge", status: "ok", pr: 5 },
    { project: "leitstand", step: "merge", status: "ok", pr: 5 },
    { project: "lernapp", step: "merge", status: "ok", pr: 9, created_at: vor(30) },
    { project: "lernapp", step: "merge", status: "fehler", pr: 3 },
  ]);
  assert.deepEqual(merges(e, jetzt), [{ project: "leitstand", pr: 5, selbstBehoben: false }]);
});

test("selbst behoben: Reparatur auf demselben PR", () => {
  const e = ev([
    { project: "leitstand", step: "repair", status: "start", pr: 5 },
    { project: "leitstand", step: "merge", status: "ok", pr: 5 },
    { project: "leitstand", step: "merge", status: "ok", pr: 6 },
  ]);
  const z = zahlen({ events: e, snapshot: [] }, jetzt);
  assert.deepEqual([z.gemergt, z.selbstBehoben], [2, 1]);
});

test("Zahlen: braucht dich und Claude nur als Schätzung aus dem Snapshot", () => {
  const s = parseSnapshot([
    { project: "a", status: "needs_human" },
    { project: "a", quota_name: "Claude Max", quota_used: 4, quota_limit: 10 },
    { project: "a", quota_name: "Vercel", quota_used: 1, quota_limit: 2 },
  ]);
  const z = zahlen({ events: [], snapshot: s }, jetzt);
  assert.equal(z.brauchtDich, 1);
  assert.deepEqual(z.claude.map((k) => [k.name, k.schaetzung]), [["Claude Max", true]]);
});

test("ohne Daten kein Satz; mit Daten Satz mit Belegen", () => {
  assert.equal(auswertungSatz({ events: [], snapshot: [] }, jetzt), null);
  const s = auswertungSatz({ events: ev([{ project: "leitstand", step: "merge", status: "ok", pr: 5 }]), snapshot: [] }, jetzt);
  assert.equal(s?.satz, "Heute 1 PR gemergt.");
  assert.equal(s?.belege.length, 1);
});

test("bereicheSumme addiert Dateien in fester Reihenfolge", () => {
  const z = (bereich: "Frontend" | "Backend", dateien: number) => ({ bereich, dateien, satz: "s" });
  assert.deepEqual(bereicheSumme([[z("Frontend", 2)], [z("Backend", 1), z("Frontend", 3)]]).map((x) => `${x.bereich}:${x.dateien}`), ["Backend:1", "Frontend:5"]);
});
