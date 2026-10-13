import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEvents, parseFortschritt, parseSnapshot } from "./uebersicht";
import { fortschritt, heuteFertig, karten, lageSatz, stationen } from "./uebersicht-einfach";
import type { WartenderPr } from "./wartende-prs";

const jetzt = new Date("2026-10-12T12:00:00Z");
const vor = (min: number) => new Date(jetzt.getTime() - min * 60_000).toISOString();
const ev = (rows: Record<string, unknown>[]) => parseEvents(rows.map((r, i) => ({ id: String(i), project: "leitstand", ...r })));
const wartender: WartenderPr = { key: "siinanXD/Leitstand#7", repo: "siinanXD/Leitstand", nummer: 7, titel: "Gate-Regel", url: "https://github.com/siinanXD/Leitstand/pull/7", grund: "Riskante Änderung." };

test("lageSatz: wartet, nichts zu tun, Alarm, keine Daten", () => {
  const q = { events: ev([{ created_at: vor(5), step: "worker", status: "start", issue: "SIN-1" }]), snapshot: [] };
  assert.equal(lageSatz(q, 2, jetzt)?.satz, "2 Dinge warten auf dich. Alles andere läuft von allein.");
  assert.equal(lageSatz(q, 1, jetzt)?.satz, "1 Ding wartet auf dich. Alles andere läuft von allein.");
  assert.equal(lageSatz(q, 0, jetzt)?.satz, "Nichts zu tun. Alles läuft.");
  const rot = { events: ev([{ created_at: vor(5), step: "deploy", status: "failure", issue: "SIN-9" }]), snapshot: [] };
  const alarm = lageSatz(rot, 0, jetzt);
  assert.equal(alarm?.alarm, true);
  assert.match(alarm?.satz ?? "", /^Achtung: Etwas ist kaputt\.$/);
  assert.equal(lageSatz({ events: [], snapshot: [] }, 0, jetzt), null);
});

test("karten: wartende PRs mit Freigeben, Aufgaben nur mit Ansehen, kein PR doppelt", () => {
  const snapshot = parseSnapshot([
    { project: "leitstand", issue: "SIN-5", title: "Frage klären", labels: ["sinan"], status: "waiting", minutes: 2 },
    { project: "leitstand", pr: 7, title: "Gate-Regel", labels: ["risk:high"], status: "waiting" },
  ]);
  const liste = karten({ events: [], snapshot }, [wartender]);
  assert.deepEqual(liste.map((k) => k.titel), ["Gate-Regel", "Frage klären"]);
  assert.equal(liste[0].wartender, wartender);
  assert.equal(liste[0].pr, "#7");
  assert.equal(liste[0].projekt, "Leitstand");
  assert.equal(liste[1].wartender, null);
  assert.equal(liste[1].minuten, 2);
  assert.equal(liste[1].ansehen, "https://linear.app/sinan-kahraman/issue/SIN-5");
  assert.deepEqual(karten({ events: [], snapshot: [] }, []), []);
});

test("stationen: Eintrag liegt, wo sein jüngstes Ereignis liegt; aktiv, Laufzeit, wartet, live nur heute", () => {
  const events = ev([
    { created_at: vor(30), step: "dispatch", status: "ok", issue: "SIN-1" },
    { created_at: vor(12), step: "worker", status: "start", issue: "SIN-2" },
    { created_at: vor(20), step: "worker", status: "start", issue: "SIN-3" },
    { created_at: vor(3), step: "pr-gate", status: "ok", issue: "SIN-3" },
    { created_at: vor(10), step: "merge", status: "ok", issue: "SIN-4" },
    { created_at: vor(60 * 20), step: "merge", status: "ok", issue: "SIN-0" },
    { created_at: vor(8), step: "pr-gate", status: "ok", pr: 7 },
  ]);
  const snapshot = parseSnapshot([{ project: "leitstand", issue: "SIN-2", title: "Kosten-Block" }]);
  const s = Object.fromEntries(stationen({ events, snapshot }, [wartender], jetzt).map((x) => [x.id, x.eintraege]));
  assert.deepEqual(s.geplant.map((e) => e.titel), ["SIN-1"]);
  assert.deepEqual(s.gebaut.map((e) => [e.titel, e.minuten, e.aktiv]), [["Kosten-Block", 12, true]]);
  assert.deepEqual(s.geprueft.map((e) => [e.titel, e.minuten, e.aktiv]), [["SIN-3", 3, false]]);
  assert.deepEqual(s.wartet.map((e) => e.titel), ["Gate-Regel"]);
  assert.deepEqual(s.live.map((e) => e.titel), ["SIN-4"]);
});

test("stationen: immer fünf, auch ohne Daten", () => {
  const liste = stationen({ events: [], snapshot: [] }, [], jetzt);
  assert.deepEqual(liste.map((s) => s.name), ["Geplant", "Wird gebaut", "Wird geprüft", "Wartet auf dich", "Ist live"]);
  assert.ok(liste.every((s) => s.eintraege.length === 0));
});

test("fortschritt: nur lesbare Werte, nichts geraten", () => {
  assert.deepEqual(parseFortschritt({ done: 34, total: 41, ideas: 3 }), { fertig: 34, gesamt: 41, neueIdeen: 3 });
  assert.deepEqual(parseFortschritt('{"done":1,"total":2}'), { fertig: 1, gesamt: 2, neueIdeen: 0 });
  for (const kaputt of [null, "x", { done: 5, total: 0 }, { done: 5, total: 3 }, { done: -1, total: 3 }, { total: 3 }]) assert.equal(parseFortschritt(kaputt), null);
  const snapshot = parseSnapshot([
    { project: "lernapp", progress: { done: 34, total: 41, ideas: 3 } },
    { project: "leitstand", progress: "kaputt" },
  ]);
  assert.deepEqual(fortschritt({ events: [], snapshot }), [{ project: "lernapp", fertig: 34, gesamt: 41, neueIdeen: 3 }]);
});

test("heuteFertig: nur heutige Merges, jüngster zuerst, je Issue einmal", () => {
  const events = ev([
    { created_at: vor(60), step: "merge", status: "ok", issue: "SIN-1" },
    { created_at: vor(30), step: "merge", status: "ok", issue: "SIN-2" },
    { created_at: vor(20), step: "merge", status: "ok", issue: "SIN-2" },
    { created_at: vor(15), step: "merge", status: "failure", issue: "SIN-3" },
    { created_at: vor(60 * 30), step: "merge", status: "ok", issue: "SIN-4" },
  ]);
  const snapshot = parseSnapshot([{ project: "leitstand", issue: "SIN-2", title: "Der Kosten-Block steht" }]);
  const liste = heuteFertig({ events, snapshot }, jetzt);
  assert.deepEqual(liste.map((f) => f.satz), ["Der Kosten-Block steht", "Eine Aufgabe ist fertig"]);
  assert.ok(!Number.isNaN(Date.parse(liste[0].zeit)));
});
