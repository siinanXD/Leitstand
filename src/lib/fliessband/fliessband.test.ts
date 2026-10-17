import assert from "node:assert/strict";
import { test } from "node:test";
import type { SnapshotRow } from "../uebersicht";
import { bezugVon, fliessband, parseFliessEreignisse, PRODUKTE, STATIONEN, type FliessAufgabe, type FliessEreignis } from "./fliessband";

const JETZT = new Date("2026-10-17T12:00:00Z");
const vor = (min: number) => new Date(JETZT.getTime() - min * 60_000).toISOString();

const aufgabe = (o: Partial<FliessAufgabe> = {}): FliessAufgabe => ({ issue: "SIN-1", titel: "Titel", projekt: "leitstand", status: "laeuft", gestartet: vor(10), fertig: null, labels: [], haken: null, bezug: [], ...o });
const ereignis = (o: Partial<FliessEreignis> = {}): FliessEreignis => ({ created_at: vor(5), project: "leitstand", step: "WORK", status: "ok", issue: "SIN-1", pr: null, grund: null, run: null, ...o });
const pr = (o: Record<string, unknown> = {}) => ({ repo: "siinanXD/Leitstand", nummer: 7, titel: "feat: x (SIN-1)", url: "https://github.com/siinanXD/Leitstand/pull/7", labels: [] as string[], entwurf: false, ciGruen: true, grund: null, ...o });
const snapshot = (...prs: ReturnType<typeof pr>[]): SnapshotRow[] => [{ project: "leitstand", open_prs: prs } as unknown as SnapshotRow];

const karte = (a: FliessAufgabe[], e: FliessEreignis[] = [], s: SnapshotRow[] = [], issue = "SIN-1") =>
  fliessband({ aufgaben: a, snapshot: s, events: e, jetzt: JETZT }).produkte.flatMap((p) => p.karten).find((k) => k.issue === issue);

test("alle vier Produkte stehen in der Antwort, leer = „Nichts – alles läuft“", () => {
  const f = fliessband({ aufgaben: [], snapshot: [], events: [], jetzt: JETZT });
  assert.deepEqual(f.produkte.map((p) => p.id), [...PRODUKTE]);
  assert.equal(f.brauchtDichText, "Nichts – alles läuft");
});

test("Station geplant: grün, gelb mit Blocker", () => {
  const frei = karte([aufgabe({ status: "offen", gestartet: null })]);
  assert.deepEqual([frei?.station, frei?.farbe], ["geplant", "gruen"]);
  const s = [{ project: "leitstand", issue: "SIN-1", blocked_by: ["SIN-0"], open_prs: [] } as unknown as SnapshotRow];
  const blockiert = karte([aufgabe({ status: "offen", gestartet: null })], [], s);
  assert.deepEqual([blockiert?.farbe, blockiert?.grund], ["gelb", "Blockiert durch SIN-0."]);
});

test("Station baut: grün, mit Haken und Linear-Link", () => {
  const k = karte([aufgabe({ haken: { erledigt: 1, gesamt: 3 } })], [ereignis()]);
  assert.deepEqual([k?.station, k?.farbe, k?.haken], ["baut", "gruen", { erledigt: 1, gesamt: 3 }]);
  assert.equal(k?.links.linear, "https://linear.app/sinan-kahraman/issue/SIN-1");
});

test("Station PR offen: CI läuft noch, Run-Link aus dem Ereignis", () => {
  const k = karte([aufgabe()], [ereignis({ step: "PR", pr: 7, run: "https://github.com/run/1" })], snapshot(pr({ ciGruen: false })));
  assert.deepEqual([k?.station, k?.farbe, k?.links.pr, k?.links.run], ["pr-offen", "gruen", "https://github.com/siinanXD/Leitstand/pull/7", "https://github.com/run/1"]);
});

test("Station Prüfung: CI grün; fehlende Haken sind gelb mit Grund", () => {
  const k = karte([aufgabe({ haken: { erledigt: 1, gesamt: 3 } })], [ereignis({ step: "PR", pr: 7 })], snapshot(pr()));
  assert.deepEqual([k?.station, k?.farbe, k?.grund], ["pruefung", "gelb", "Bewertungen fehlen: 1 von 3 Kriterien belegt."]);
});

test("Station Einspruchsfrist: gelb mit Frist aus dem Gate", () => {
  const k = karte([aufgabe()], [ereignis({ step: "GATE", pr: 7, grund: "Einspruchsfrist bis 12:10" })], snapshot(pr({ labels: ["einspruch"] })));
  assert.deepEqual([k?.station, k?.farbe, k?.grund], ["einspruchsfrist", "gelb", "Einspruchsfrist bis 12:10"]);
});

test("Station gemergt: grün, nach 15 Minuten ohne Live-Check gelb", () => {
  const neu = karte([aufgabe()], [ereignis({ step: "MERGE", created_at: vor(3) })]);
  assert.deepEqual([neu?.station, neu?.farbe], ["gemergt", "gruen"]);
  const alt = karte([aufgabe()], [ereignis({ step: "MERGE", created_at: vor(30) })]);
  assert.deepEqual([alt?.station, alt?.farbe], ["gemergt", "gelb"]);
});

test("Station Live-Check: rote Probe nach dem Mergen ist rot", () => {
  const k = karte([aufgabe()], [ereignis({ step: "MERGE", created_at: vor(30) }), ereignis({ step: "ABNAHME", issue: null, status: "red", grund: "Seite antwortet nicht", created_at: vor(5) })]);
  assert.deepEqual([k?.station, k?.farbe, k?.grund], ["live-check", "rot", "Seite antwortet nicht"]);
});

test("Station Fertig: grüne Probe oder Linear fertig; älter als 12 h fällt weg", () => {
  const probe = karte([aufgabe()], [ereignis({ step: "MERGE", created_at: vor(30) }), ereignis({ step: "ABNAHME", issue: null, created_at: vor(5) })]);
  assert.equal(probe?.station, "fertig");
  const fertig = karte([aufgabe({ status: "fertig", fertig: vor(60) })]);
  assert.deepEqual([fertig?.station, fertig?.farbe, fertig?.seit], ["fertig", "gruen", vor(60)]);
  assert.equal(karte([aufgabe({ status: "fertig", fertig: vor(13 * 60) })]), undefined);
});

test("alle 8 Stationen sind abgedeckt", () => {
  assert.equal(STATIONEN.length, 8);
});

test("Farbe rot: länger als 90 Minuten ohne Fortschritt, needs-human, Check rot", () => {
  const haengt = karte([aufgabe({ gestartet: vor(100) })]);
  assert.deepEqual([haengt?.farbe, haengt?.grund], ["rot", "Seit 100 Minuten kein Fortschritt."]);
  assert.equal(karte([aufgabe({ labels: ["needs-human"] })], [ereignis()])?.farbe, "rot");
  const check = karte([aufgabe()], [ereignis({ step: "BUILD", status: "failure", pr: 7, grund: "Test rot" })], snapshot(pr({ ciGruen: false })));
  assert.deepEqual([check?.station, check?.farbe, check?.grund], ["pruefung", "rot", "Test rot"]);
});

test("Farbe blau: ein laufendes Issue nennt das hängende als verwandt", () => {
  const a = [aufgabe({ gestartet: vor(100) }), aufgabe({ issue: "SIN-2", bezug: ["SIN-1"], gestartet: vor(5) })];
  const k = karte(a, [ereignis({ issue: "SIN-2" })]);
  assert.deepEqual([k?.farbe, k?.grund], ["blau", "Repariert sich: SIN-2 läuft."]);
  const ohne = karte([aufgabe({ gestartet: vor(100) }), aufgabe({ issue: "SIN-2", bezug: ["SIN-1"], status: "offen" })]);
  assert.equal(ohne?.farbe, "rot");
});

test("Braucht dich: höchstens 3 Punkte mit Link, PR risk:high zuerst", () => {
  const sinan = [2, 3, 4].map((n) => aufgabe({ issue: `SIN-${n}`, labels: ["sinan"], status: "offen" }));
  const f = fliessband({ aufgaben: sinan, snapshot: snapshot(pr({ labels: ["risk:high"] }), pr({ nummer: 8, labels: ["risk:high", "freigegeben"] })), events: [], jetzt: JETZT });
  assert.equal(f.brauchtDich.length, 3);
  assert.match(f.brauchtDich[0].url, /pull\/7$/);
  assert.equal(f.brauchtDichText, null);
});

test("andere Produkte und abgebrochene Aufgaben zählen nicht", () => {
  assert.equal(karte([aufgabe({ projekt: "beleg" })]), undefined);
  assert.equal(karte([aufgabe({ status: "abgebrochen" })]), undefined);
});

test("Parser lesen Grund und Run auch aus payload; bezug nach Kennung", () => {
  const [e] = parseFliessEreignisse([{ created_at: vor(1), step: "pr-gate", payload: { grund: "Warten", run_url: "https://x/run" } }, { created_at: "kaputt" }]);
  assert.deepEqual([e.step, e.grund, e.run], ["GATE", "Warten", "https://x/run"]);
  assert.deepEqual(bezugVon([{ issue: "SIN-1", bezug: ["SIN-2", 3] }]).get("SIN-1"), ["SIN-2"]);
});
