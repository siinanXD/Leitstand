import assert from "node:assert/strict";
import { test } from "node:test";
import { aktivitaetKacheln, aufgabenFuerDich, belegChips, inArbeitZeilen, kennzahlen, pipelineSchiene } from "./uebersicht-b1";
import { parseEvents, parseSnapshot } from "./uebersicht";

const jetzt = new Date("2026-10-12T12:00:00Z");
const vor = (h: number) => new Date(jetzt.getTime() - h * 3_600_000).toISOString();
const ev = (rows: Record<string, unknown>[]) => parseEvents(rows.map((r, i) => ({ id: String(i), project: "leitstand", ...r })));

test("pipelineSchiene: Zustand je Stufe, offene WORK-Läufe, Grundzeile bei Rot", () => {
  const e = ev([
    { created_at: vor(5), step: "deploy", status: "failure", issue: "SIN-309" },
    { created_at: vor(4), step: "deploy", status: "failure", issue: "SIN-309" },
    { created_at: vor(2), step: "dispatch", status: "ok" },
    { created_at: vor(1), step: "worker", status: "start", issue: "SIN-1" },
    { created_at: vor(0.5), step: "worker", status: "start", issue: "SIN-2" },
  ]);
  const { stufen, grund } = pipelineSchiene(e, jetzt);
  const nach = Object.fromEntries(stufen.map((s) => [s.stage, s]));
  assert.equal(nach.QUEUE.zustand, "ok");
  assert.deepEqual([nach.WORK.zustand, nach.WORK.anzahl], ["laufend", 2]);
  assert.equal(nach.DEPLOY.zustand, "rot");
  assert.equal(nach.PLAN.zustand, "leer");
  assert.match(grund ?? "", /^DEPLOY rot: seit \d\d:\d\d \(SIN-309\)\.$/);
  assert.deepEqual(pipelineSchiene([], jetzt), { stufen: [], grund: null });
});

test("inArbeitZeilen: Done-Issues fallen heraus, offene Läufe bleiben, mit Dauer und Kosten", () => {
  const snapshot = parseSnapshot([
    { project: "leitstand", issue: "SIN-481", status: "in_progress", title: "Rollen" },
    { project: "leitstand", issue: "SIN-500", status: "in_progress", title: "Aktiv" },
  ]);
  const events = ev([
    { created_at: vor(3), step: "worker", status: "start", issue: "SIN-481" },
    { created_at: vor(2), step: "merge", status: "ok", issue: "SIN-481" },
    { created_at: vor(1), step: "worker", status: "start", issue: "SIN-500", cost_usd: 1.5 },
    { created_at: vor(0.5), step: "worker", status: "start", issue: "SIN-501" },
  ]);
  const z = inArbeitZeilen({ events, snapshot }, jetzt);
  assert.deepEqual(z.map((x) => x.issue).sort(), ["SIN-500", "SIN-501"]);
  const a = z.find((x) => x.issue === "SIN-500")!;
  assert.deepEqual([a.titel, a.dauerMin, a.kosten], ["Aktiv", 60, 1.5]);
  assert.equal(z.find((x) => x.issue === "SIN-501")!.kosten, null);
});

test("aufgabenFuerDich: sinan-Label und risk:high ohne freigegeben, Minuten aus dem Issue", () => {
  const s = parseSnapshot([
    { project: "a", issue: "SIN-1", title: "Prüfen", labels: "sinan", minutes: 20, status: "todo" },
    { project: "a", issue: "SIN-2", title: "Erledigt", labels: ["sinan"], status: "done" },
    { project: "a", pr: 124, title: "Konflikt", labels: ["risk:high", "min:2"] },
    { project: "a", pr: 125, title: "Freigegeben", labels: ["risk:high", "freigegeben"] },
    { project: "a", issue: "SIN-3", title: "Ohne Label", labels: ["bug"] },
  ]);
  const r = aufgabenFuerDich(s);
  assert.deepEqual(r.map((x) => [x.ref, x.minuten]), [["SIN-1", 20], ["#124", 2]]);
});

test("kennzahlen: nichts erfunden, Gemergt heute zählt Merges des Tages", () => {
  assert.deepEqual(kennzahlen({ events: [], snapshot: [] }, jetzt), []);
  const events = ev([
    { created_at: vor(1), step: "merge", status: "ok", pr: 1 },
    { created_at: vor(1), step: "merge", status: "ok", pr: 1 },
    { created_at: vor(2), step: "merge", status: "ok", pr: 2 },
    { created_at: vor(2), step: "merge", status: "failure", pr: 3 },
  ]);
  const k = kennzahlen({ events, snapshot: [] }, jetzt);
  assert.equal(k.find((x) => x.label === "Gemergt heute")?.wert, "2");
  assert.ok(!k.some((x) => /reife|prognose/i.test(x.label)));
});

test("aktivitaetKacheln: 24 Kacheln, rot bei Fehler", () => {
  const k = aktivitaetKacheln(ev([{ created_at: vor(0.2) }, { created_at: vor(0.3), status: "failure" }, { created_at: vor(5.5) }]), jetzt);
  assert.equal(k.length, 24);
  assert.deepEqual([k[23].anzahl, k[23].rot, k[23].stufe], [2, true, 3]);
  assert.deepEqual([k[18].anzahl, k[18].rot], [1, false]);
  assert.equal(k[0].stufe, 0);
});

test("belegChips: PR und Issue ohne Doppelte", () => {
  const c = belegChips(ev([{ created_at: vor(1), pr: 101, issue: "SIN-309" }, { created_at: vor(2), pr: 101 }]), jetzt);
  assert.deepEqual(c, ["#101", "SIN-309"]);
});
