import assert from "node:assert/strict";
import { test } from "node:test";
import { verlauf } from "./verlauf";

test("Verlauf: Sätze statt Schrittnamen, gleiche Schritte zusammengefasst, nur diese Aufgabe", () => {
  const roh = [
    { issue: "SIN-1", step: "dispatch", status: "ok", created_at: "2026-10-13T10:00:00Z" },
    { issue: "SIN-1", step: "worker", status: "start", created_at: "2026-10-13T10:01:00Z" },
    { issue: "SIN-1", step: "worker", status: "fehler", created_at: "2026-10-13T10:04:00Z" },
    { issue: "SIN-1", step: "worker", status: "fehler", created_at: "2026-10-13T10:07:00Z" },
    { issue: "SIN-2", step: "merge", status: "ok", created_at: "2026-10-13T10:08:00Z" },
    { issue: "SIN-1", step: "merge", status: "ok", created_at: "2026-10-13T11:00:00Z" },
    { issue: "SIN-1", step: "status", status: "ok", created_at: "2026-10-13T11:01:00Z" },
  ];
  const v = verlauf(roh, "SIN-1");
  assert.deepEqual(v.map((s) => s.satz), ["Eingeplant", "Ein Helfer hat angefangen", "Versuch ohne Ergebnis", "Fertig und übernommen"]);
  assert.equal(v[2].anzahl, 2);
  assert.equal(v[2].rot, true);
});
