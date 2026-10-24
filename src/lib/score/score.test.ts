import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pruefeSchema, type Schema } from "../autonomy/schema";
import { bereitsBewertet, scoreAusLauf, scoreAusPr, scoreGrund, type PrEingabe } from "./score";

const schema = JSON.parse(readFileSync("docs/schemas/score.json", "utf8")) as Schema;
const rollen = (JSON.parse(readFileSync("docs/autonomy/rollen.json", "utf8")) as { rollen: { schritt: string }[] }).rollen.map((r) => r.schritt);

const basis: PrEingabe = {
  produkt: "leitstand",
  issue: "SIN-900",
  pr: 12,
  rolle: "claude",
  start: "2026-10-20T10:00:00Z",
  erstellt: "2026-10-20T10:20:00Z",
  gemergt: "2026-10-20T11:00:00Z",
  dateien: ["src/lib/score/score.ts", "src/app/ablauf/seite.tsx"],
  workerPfade: ["src/lib/score", "src/app/ablauf"],
  builds: [{ fertig: "2026-10-20T10:30:00Z", ergebnis: "success" }],
  eingriffe: [],
  reverts: [],
  ereignisse: [],
  owner: "siinanXD",
  kostenUsd: null,
  kursUsdEur: null,
  jetzt: new Date("2026-10-20T12:00:00Z"),
};

test("zwei Reparaturrunden: direkt false, Bereiche aus den Dateien", () => {
  const s = scoreAusPr({
    ...basis,
    ereignisse: [
      { created_at: "2026-10-20T10:40:00Z", step: "repair", status: "start", grund: null, pr: 12 },
      { created_at: "2026-10-20T10:50:00Z", step: "repair", status: "start", grund: null, pr: 12 },
      { created_at: "2026-10-20T10:55:00Z", step: "repair", status: "fehler", grund: "Test rot: build rot", pr: 12 },
    ],
  });
  assert.equal(s.direkt, false);
  assert.equal(s.reparatur_runden, 2);
  assert.deepEqual(s.bereiche, ["Backend", "Frontend"]);
  assert.equal(s.minuten, 60);
  assert.deepEqual(s.fehler, [{ bereich: "Backend", art: "unklar", ursache: "Test rot: build rot", datei: null }]);
  assert.deepEqual(pruefeSchema(s, schema), []);
});

test("ohne Reparatur und mit einer Prüfer-Runde: direkt true", () => {
  const s = scoreAusPr({ ...basis, ereignisse: [{ created_at: "2026-10-20T10:45:00Z", step: "pruefer", status: "ok", grund: null, pr: 12 }] });
  assert.equal(s.direkt, true);
  assert.equal(s.pruefer_runden, 1);
  assert.equal(s.reparatur_runden, 0);
  assert.equal(s.minuten_bis_gruen, 10);
  assert.equal(s.build_erster_lauf_gruen, true);
  assert.deepEqual(pruefeSchema(s, schema), []);
});

test("zweite Prüfer-Runde ist nicht direkt", () => {
  const e = (zeit: string) => ({ created_at: zeit, step: "pruefer", status: "ok", grund: null, pr: 12 });
  assert.equal(scoreAusPr({ ...basis, ereignisse: [e("2026-10-20T10:40:00Z"), e("2026-10-20T10:50:00Z")] }).direkt, false);
});

test("zwei Pushes von Sinan, Datei außerhalb des Scopes, rotes erstes build", () => {
  const s = scoreAusPr({
    ...basis,
    dateien: [...basis.dateien, "package.json"],
    builds: [
      { fertig: "2026-10-20T10:50:00Z", ergebnis: "success" },
      { fertig: "2026-10-20T10:30:00Z", ergebnis: "failure" },
    ],
    eingriffe: [
      { von: "siinanXD", art: "push" },
      { von: "siinanXD", art: "push" },
      { von: "claude[bot]", art: "push" },
    ],
  });
  assert.equal(s.eingriffe_sinan, 2);
  assert.equal(s.dateien_ausserhalb_scope, 1);
  assert.equal(s.build_erster_lauf_gruen, false);
  assert.equal(s.minuten_bis_gruen, 30);
});

test("ohne worker-pfade, ohne build und ohne Kosten bleiben Werte null statt erfunden", () => {
  const s = scoreAusPr({ ...basis, workerPfade: null, builds: [] });
  assert.equal(s.dateien_ausserhalb_scope, null);
  assert.equal(s.build_erster_lauf_gruen, null);
  assert.equal(s.minuten_bis_gruen, null);
  assert.equal(s.kosten_eur, null);
  assert.equal(scoreAusPr({ ...basis, kostenUsd: 2, kursUsdEur: 0.9 }).kosten_eur, 1.8);
});

test("regression_24h: true bei Revert oder roter Abnahme nach dem Merge, null solange 24 h nicht um sind, sonst false", () => {
  assert.equal(scoreAusPr({ ...basis, reverts: ["2026-10-20T15:00:00Z"] }).regression_24h, true);
  assert.equal(scoreAusPr({ ...basis, reverts: ["2026-10-22T15:00:00Z"], jetzt: new Date("2026-10-23T00:00:00Z") }).regression_24h, false);
  assert.equal(scoreAusPr(basis).regression_24h, null);
  assert.equal(scoreAusPr({ ...basis, jetzt: new Date("2026-10-22T00:00:00Z") }).regression_24h, false);
  const abnahme = { created_at: "2026-10-20T20:00:00Z", step: "abnahme", status: "fehler", grund: "rot", pr: null };
  assert.equal(scoreAusPr({ ...basis, ereignisse: [abnahme] }).regression_24h, true);
});

test("Rollen ohne PR: Score aus dem eigenen Lauf-Ereignis, ok und fehler mit grund", () => {
  const ok = scoreAusLauf("leitstand", { created_at: "2026-10-20T10:00:00Z", step: "planer", status: "ok", grund: null, issue: "SIN-1", cost: null });
  assert.equal(ok?.rolle, "planer");
  assert.equal(ok?.pr, null);
  assert.equal(ok?.direkt, true);
  assert.deepEqual(ok?.fehler, []);
  assert.deepEqual(pruefeSchema(ok, schema), []);
  const rot = scoreAusLauf("lernapp", { created_at: "2026-10-20T10:00:00Z", step: "designer", status: "fehler", grund: "Kontingent: Limit", issue: null, cost: null });
  assert.equal(rot?.direkt, false);
  assert.equal(rot?.fehler[0].ursache, "Kontingent: Limit");
  assert.equal(rot?.fehler[0].art, "unklar");
  assert.deepEqual(pruefeSchema(rot, schema), []);
  assert.equal(scoreAusLauf("leitstand", { created_at: "2026-10-20T10:00:00Z", step: "content-fabrik", status: "fehler", grund: null, issue: null, cost: null })?.fehler[0].ursache, "ohne Grund");
  // Nur beendete Läufe der drei Rollen zählen.
  assert.equal(scoreAusLauf("leitstand", { created_at: "x", step: "planer", status: "start", grund: null, issue: null, cost: null }), null);
  assert.equal(scoreAusLauf("leitstand", { created_at: "x", step: "dispatch", status: "ok", grund: null, issue: null, cost: null }), null);
});

test("Rolle des PR-Scores steht in rollen.json", () => {
  assert.ok(rollen.includes(basis.rolle));
});

test("scoreGrund und bereitsBewertet: Rundreise, Schlüssel verhindert Doppelzeilen", () => {
  const s = scoreAusPr(basis);
  const grund = scoreGrund(s);
  assert.ok(grund.startsWith("score: {"));
  const zeile = { grund };
  assert.equal(bereitsBewertet([zeile, { grund: null }, { grund: "score: kaputt" }], s), true);
  assert.equal(bereitsBewertet([zeile], { ...s, pr: 13 }), false);
  const lauf = scoreAusLauf("leitstand", { created_at: "2026-10-20T10:00:00Z", step: "planer", status: "ok", grund: null, issue: null, cost: null })!;
  assert.equal(bereitsBewertet([{ grund: scoreGrund(lauf) }], lauf), true);
  assert.equal(bereitsBewertet([{ grund: scoreGrund(lauf) }], { ...lauf, quelle: "2026-10-20T11:00:00Z" }), false);
});
