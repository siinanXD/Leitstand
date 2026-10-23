import { test } from "node:test";
import assert from "node:assert/strict";
import { kanarieNoetig, kennzahl, stationen, zeile, type StreckeIssue } from "./strecke";
import type { Ereignis } from "../kennzahlen/durchstich";

const t = (h: number) => new Date(Date.UTC(2026, 9, 20, h)).toISOString();
const e = (h: number, step: string, status: string, issue: string | null, pr: number | null = null): Ereignis => ({ created_at: t(h), step, status, issue, pr });
const kette = (k: string, pr: number, bis: number): Ereignis[] =>
  [e(1, "worker", "start", k), e(2, "worker", "ok", k, pr), e(3, "pruefer", "ok", null, pr), e(4, "merge", "ok", null, pr), e(5, "deploy", "ok", null, pr), e(6, "abnahme", "ok", k)].slice(0, bis);
const issue = (kennung: string, done = true): StreckeIssue => ({ kennung, todoAm: t(0), doneAm: done ? t(7) : null });

test("Stationen: alle erreicht aus Linear, loop_events und Deploy-Status", () => {
  const s = stationen(issue("SIN-1"), kette("SIN-1", 10, 6));
  assert.equal(s.haengtBei, null);
  assert.equal(s.dauerMin, 420);
  assert.equal(Object.keys(s.zeiten).length, 8);
});

test("Stationen: fehlende Station wird als Hänge-Station erkannt", () => {
  assert.equal(stationen(issue("SIN-1", false), kette("SIN-1", 10, 4)).haengtBei, "deploy");
  assert.equal(stationen(issue("SIN-1", false), []).haengtBei, "worker");
  assert.equal(stationen(issue("SIN-1", false), kette("SIN-1", 10, 6)).haengtBei, "done");
});

test("Stationen: Ereignisse eines anderen PR und Proben vor dem Deploy zählen nicht", () => {
  const fremd = [...kette("SIN-1", 10, 2), e(3, "pruefer", "ok", null, 99), e(2.5, "abnahme", "ok", "SIN-1")];
  assert.equal(stationen(issue("SIN-1", false), fremd).haengtBei, "pruefer");
});

const strecken = [
  stationen(issue("SIN-1"), kette("SIN-1", 1, 6)),
  stationen(issue("SIN-2"), kette("SIN-2", 2, 6)),
  stationen(issue("SIN-3", false), kette("SIN-3", 3, 5)),
  stationen(issue("SIN-4", false), kette("SIN-4", 4, 5)),
  stationen(issue("SIN-5", false), kette("SIN-5", 5, 2)),
];

test("Kennzahlen: Anteil, Median und häufigste Hänge-Station aus 5 Issues", () => {
  const k = kennzahl(strecken);
  assert.equal(k.gesamt, 5);
  assert.equal(k.live, 2);
  assert.equal(k.median_min, 420);
  assert.equal(k.haengt_meist, "probe");
  assert.equal(k.haengt.length, 3);
  assert.equal(zeile(k), "Ende-zu-Ende: 2 von 5 live, Median 7 h 0 min, hängt meist bei: Live-Probe");
});

test("Kennzahlen: ohne Issues leer", () => {
  const k = kennzahl([]);
  assert.deepEqual([k.gesamt, k.live, k.median_min, k.haengt_meist], [0, 0, null, null]);
});

test("Kanarienlauf: nur bei 0 erfolgreichen Issues und höchstens einer offen", () => {
  const leer = kennzahl([]);
  const live = kennzahl([stationen(issue("SIN-1"), kette("SIN-1", 1, 6))]);
  assert.equal(kanarieNoetig(leer, []), true);
  assert.equal(kanarieNoetig(live, []), false);
  assert.equal(kanarieNoetig(leer, [{ kennung: "SIN-9", todoAm: t(0), doneAm: null, labels: ["kanarie"], offen: true }]), false);
  assert.equal(kanarieNoetig(leer, [{ kennung: "SIN-9", todoAm: t(0), doneAm: t(1), labels: ["kanarie"], offen: false }]), true);
});
