import assert from "node:assert/strict";
import { test } from "node:test";
import { pauseEingabe, pauseSatz, pauseStand, pauseZeile } from "./pause";

const z = (status: string, created_at: string, step = "PAUSE") => ({ step, status, created_at });

test("Ohne Ereignis läuft der Loop", () => assert.deepEqual(pauseStand([]), { pausiert: false }));

test("Das jüngste PAUSE-Ereignis gilt, egal wie sortiert", () => {
  assert.deepEqual(pauseStand([z("weiter", "2026-10-12T10:00:00Z"), z("pausiert", "2026-10-12T08:00:00Z")]), { pausiert: false });
  assert.deepEqual(pauseStand([z("pausiert", "2026-10-12T10:00:00Z"), z("weiter", "2026-10-12T08:00:00Z")]), { pausiert: true, seit: "2026-10-12T10:00:00Z" });
});

test("Andere Schritte und Status zählen nicht", () => {
  assert.deepEqual(pauseStand([z("pausiert", "2026-10-12T10:00:00Z", "dispatch"), z("fehler", "2026-10-12T11:00:00Z")]), { pausiert: false });
  assert.deepEqual(pauseStand([z("pausiert", "2026-10-12T10:00:00Z", "pause")]), { pausiert: true, seit: "2026-10-12T10:00:00Z" });
});

test("Eingabe, Zeile und Satz", () => {
  assert.equal(pauseEingabe({ pausiert: true }), true);
  assert.equal(pauseEingabe({ pausiert: "ja" }), null);
  assert.equal(pauseEingabe(null), null);
  assert.deepEqual(pauseZeile(false), { project: "leitstand", step: "PAUSE", status: "weiter", issue: null, pr: null });
  assert.equal(pauseSatz("2026-10-12T08:05:00Z", new Date("2026-10-12T10:05:00Z")), "Pausiert, angehalten vor 2 Stunden.");
});
