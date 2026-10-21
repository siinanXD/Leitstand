import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { durchstich, type Ereignis, type VerlaufIssue } from "./durchstich";

const JETZT = new Date("2026-10-20T16:00:00Z");
const ev = (step: string, status: string, issue: string | null, pr: number | null = null, grund: string | null = null): Ereignis => ({ created_at: "2026-10-20T10:00:00Z", step, status, issue, pr, grund });
const kette = (k: string, pr: number, ohneAbnahme = false): Ereignis[] => [
  ev("worker", "start", k),
  ev("worker", "ok", k, pr),
  ev("pruefer", "ok", null, pr),
  ev("merge", "ok", null, pr),
  ev("deploy", "ok", null, pr),
  ...(ohneAbnahme ? [] : [ev("abnahme", "ok", `Probe (${k})`)]),
];
const issue = (kennung: string, extra: Partial<VerlaufIssue> = {}): VerlaufIssue => ({
  kennung,
  status: "done",
  gestartetAm: "2026-10-20T08:00:00Z",
  doneAm: "2026-10-20T12:00:00Z",
  labelsImVerlauf: ["claude"],
  kommentare: [],
  mergeVon: "github-actions",
  ...extra,
});

test("3 Fixture-Issues: Durchstich, mit freigegeben, ohne Abnahme-Probe → 1 / 1 / 0", () => {
  const r = durchstich(
    [issue("SIN-1"), issue("SIN-2", { labelsImVerlauf: ["claude", "freigegeben"] }), issue("SIN-3")],
    [...kette("SIN-1", 11), ...kette("SIN-2", 12), ...kette("SIN-3", 13, true)],
    ["sinan"],
    JETZT,
  );
  assert.deepEqual(r.durchstich, ["SIN-1"]);
  assert.deepEqual(r.mit_eingriff, [{ kennung: "SIN-2", eingriffe: ["Label freigegeben"] }]);
  assert.deepEqual(r.ohne_beleg, [{ kennung: "SIN-3", fehlt: ["abnahme ok"] }]);
  assert.ok(Math.abs((r.quote ?? 0) - 1 / 3) < 1e-9);
});

test("erkennt Merge und Kommentar von Sinan, Kommentare vor dem Start zählen nicht", () => {
  const r = durchstich(
    [
      issue("SIN-4", { mergeVon: "siinanXD" }),
      issue("SIN-5", { kommentare: [{ autor: "Sinan", am: "2026-10-20T09:00:00Z" }] }),
      issue("SIN-6", { kommentare: [{ autor: "Sinan", am: "2026-10-20T07:00:00Z" }] }),
    ],
    [...kette("SIN-4", 4), ...kette("SIN-5", 5), ...kette("SIN-6", 6)],
    ["Sinan", "siinanXD"],
    JETZT,
  );
  assert.deepEqual(
    r.mit_eingriff.map((m) => [m.kennung, m.eingriffe]),
    [
      ["SIN-4", ["Merge durch Sinan"]],
      ["SIN-5", ["Kommentar von Sinan"]],
    ],
  );
  assert.deepEqual(r.durchstich, ["SIN-6"]);
});

test("zählt nur Issues, die heute (Europe/Berlin) auf Done gingen; ohne Done keine Quote", () => {
  const r = durchstich([issue("SIN-7", { doneAm: "2026-10-19T21:59:00Z" })], kette("SIN-7", 7), ["sinan"], JETZT);
  assert.deepEqual(r.durchstich, []);
  assert.equal(r.quote, null);
});

test("Hängt: In Progress länger als 2 h, mit letztem Grund", () => {
  const r = durchstich(
    [issue("SIN-8", { status: "started", doneAm: null, gestartetAm: "2026-10-20T12:30:00Z" }), issue("SIN-9", { status: "started", doneAm: null, gestartetAm: "2026-10-20T15:00:00Z" })],
    [ev("worker", "fehler", "SIN-8", null, "build rot")],
    ["sinan"],
    JETZT,
  );
  assert.deepEqual(r.haengt, [{ kennung: "SIN-8", seitMin: 210, grund: "build rot" }]);
});

test("Unbekannter Merge-Autor (kein PR-Anhang, kein Token, GitHub-Fehler) zählt nie als Durchstich", () => {
  const r = durchstich([issue("SIN-5", { mergeVon: null })], kette("SIN-5", 15), ["sinan"], JETZT);
  assert.deepEqual(r.durchstich, []);
  assert.deepEqual(r.ohne_beleg, [{ kennung: "SIN-5", fehlt: ["merge-autor"] }]);
});

test("Issue, das das Label claude vor Done verlor, wird trotzdem bewertet", () => {
  const r = durchstich([issue("SIN-6", { labelsImVerlauf: ["Bug"] })], kette("SIN-6", 16), ["sinan"], JETZT);
  assert.deepEqual(r.durchstich, ["SIN-6"]);
  const q = readFileSync(new URL("../../../scripts/kennzahlen/durchstich.ts", import.meta.url), "utf8").match(/const ABFRAGE = `[^`]*`/)?.[0] ?? "";
  assert.doesNotMatch(q, /labels:\s*\{\s*name/, "Abfrage filtert nicht auf das aktuelle Label");
});
