import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { leseMessungen, messeRollen, modellFuer, MODELLE, type MessEreignis } from "./modelle";

const ev = (min: number, step: string, status: string, extra: Partial<MessEreignis> = {}): MessEreignis => ({
  created_at: new Date(Date.parse("2026-10-20T10:00:00Z") + min * 60_000).toISOString(),
  step,
  status,
  issue: null,
  pr: null,
  ...extra,
});

test("Test: Modell je Rolle kommt aus modelle.json", () => {
  const json = JSON.parse(readFileSync("docs/autonomy/modelle.json", "utf8")) as { rollen: Record<string, { modell: string }> };
  for (const rolle of ["worker", "pruefer", "richter", "planer"]) assert.equal(modellFuer(rolle), json.rollen[rolle].modell);
  assert.throws(() => modellFuer("gibt-es-nicht"), /fehlt in docs\/autonomy\/modelle.json/);
  assert.equal(modellFuer("x", { x: { modell: "m1", kontextfenster: 1, werkzeuge: [], schritte: [] } }), "m1");
});

test("Test: Modell je Rolle kommt aus modelle.json: keine festen Modellnamen mehr außerhalb", () => {
  const dateien = [
    ...readdirSync(".github/workflows").map((f) => `.github/workflows/${f}`),
    "scripts/pruefer/pruefer.ts",
    "scripts/marketing/marketing.ts",
    "src/lib/vorarbeiter/vorarbeiter.ts",
  ];
  for (const d of dateien) assert.doesNotMatch(readFileSync(d, "utf8"), /claude-(opus|sonnet|haiku|fable)-\d/, d);
  for (const [rolle, r] of Object.entries(MODELLE)) assert.ok(r.modell && r.kontextfenster > 0 && r.werkzeuge.length > 0 && r.schritte.length > 0, rolle);
});

test("Test: Kennzahlen je Rolle und Modell werden berechnet", () => {
  const events: MessEreignis[] = [
    ev(0, "worker", "start", { issue: "SIN-1" }),
    ev(30, "worker", "ok", { issue: "SIN-1", pr: 11, cost: 1 }),
    ev(40, "pruefer", "fehler", { pr: 11 }),
    ev(50, "pruefer", "ok", { pr: 11 }),
    ev(0, "worker", "start", { issue: "SIN-2", modell: "anderes-modell" }),
    ev(10, "worker", "ok", { issue: "SIN-2", pr: 12, cost: 0.5, modell: "anderes-modell" }),
    ev(20, "pruefer", "ok", { pr: 12 }),
  ];
  const m = messeRollen(events, { durchstich: ["SIN-2"], mitEingriff: ["SIN-1"] });
  const std = m.find((x) => x.rolle === "worker" && x.modell === MODELLE.worker.modell);
  const alt = m.find((x) => x.rolle === "worker" && x.modell === "anderes-modell");
  assert.deepEqual(std, { rolle: "worker", modell: MODELLE.worker.modell, issues: 1, durchstichQuote: 0, prueferRunden: 2, kostenJeIssue: 1, dauerJeIssueMin: 30 });
  assert.deepEqual(alt, { rolle: "worker", modell: "anderes-modell", issues: 1, durchstichQuote: 1, prueferRunden: 1, kostenJeIssue: 0.5, dauerJeIssueMin: 10 });
  assert.equal(m.filter((x) => x.rolle === "richter").length, 0, "Rolle ohne Ereignisse hat keine Messung");
});

test("Messung ohne Daten bleibt null statt 0", () => {
  const [m] = messeRollen([ev(0, "worker", "start", { issue: "SIN-9" })], { durchstich: [], mitEingriff: [] });
  assert.deepEqual([m.durchstichQuote, m.prueferRunden, m.kostenJeIssue], [null, null, null]);
});

test("leseMessungen verträgt Müll", () => {
  assert.deepEqual(leseMessungen(null), { stand: null, messungen: [] });
  assert.deepEqual(leseMessungen({ stand: "2026-10-20", messungen: [{ rolle: "worker", modell: "m" }, 5] }).messungen.length, 1);
});
