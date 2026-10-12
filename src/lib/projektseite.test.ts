import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJEKTE } from "./projekte";
import { alleZeilen, alsNaechstes, linearLink, projektAufgaben, projektBetrieb, projektLinks, projekteSatz, zeitVerteilung } from "./projektseite";
import type { LoopEvent, SnapshotRow } from "./uebersicht";

const jetzt = new Date("2026-10-13T12:00:00Z");
const snap = (o: Partial<SnapshotRow>): SnapshotRow => ({ project: "leitstand", stage: null, status: null, title: null, updated_at: null, quota_name: null, quota_used: null, quota_limit: null, issue: null, blocked_by: [], quotas: [], labels: [], minutes: null, pr: null, open_prs: [], ...o });
const ev = (o: Partial<LoopEvent>): LoopEvent => ({ id: "1", created_at: "2026-10-13T11:00:00Z", project: "leitstand", step: "WORK", status: "ok", issue: null, pr: null, agent: null, cost: null, ...o });

test("Links: feste Reihenfolge, nur Bekanntes hat eine Adresse", () => {
  const links = projektLinks(PROJEKTE.find((p) => p.id === "leitstand")!);
  assert.equal(links.length, 10);
  assert.equal(links.find((l) => l.art === "github")?.href, "https://github.com/siinanXD/Leitstand");
  assert.equal(links.find((l) => l.art === "sentry")?.href, null);
  assert.equal(projektLinks(PROJEKTE.find((p) => p.id === "beleg")!).find((l) => l.art === "github")?.href, null);
});

test("Aufgaben: Label sinan, nur das Projekt, Linear-Link", () => {
  const a = projektAufgaben([snap({ issue: "SIN-9", title: "Token setzen", labels: ["sinan"], minutes: 5 }), snap({ project: "lernapp", issue: "SIN-8", labels: ["sinan"] }), snap({ issue: "SIN-7", labels: [] })], "leitstand");
  assert.equal(a.length, 1);
  assert.equal(a[0].href, "https://linear.app/sinan-kahraman/issue/SIN-9");
  assert.equal(linearLink("#4"), null);
});

test("Als Nächstes: ohne laufende, erledigte und blockierte", () => {
  const n = alsNaechstes([snap({ title: "A" }), snap({ title: "B", status: "running" }), snap({ title: "C", status: "done" }), snap({ title: "D", blocked_by: ["SIN-1"] }), snap({ project: "x", title: "E" })], "leitstand");
  assert.deepEqual(n, ["A"]);
});

test("Zeitverteilung zählt Ereignisse je Stufe und ignoriert ältere", () => {
  const z = zeitVerteilung([ev({}), ev({ id: "2" }), ev({ id: "3", step: "PR" }), ev({ id: "4", created_at: "2026-10-01T00:00:00Z" })], jetzt);
  assert.deepEqual(z.map((x) => [x.stufe, x.anzahl]), [["WORK", 2], ["PR", 1]]);
});

test("Betrieb: Kosten nur mit Kostendaten", () => {
  assert.equal(projektBetrieb({ events: [ev({})], snapshot: [] }, "leitstand", jetzt).kostenUsd, null);
  assert.equal(projektBetrieb({ events: [ev({ cost: 0.5 }), ev({ id: "2", cost: 0.25 })], snapshot: [] }, "leitstand", jetzt).kostenUsd, 0.75);
});

test("Alle Projekte: Zeilen, Phase ohne Daten leer, Satz", () => {
  const q = { events: [ev({ step: "WORK", status: "start", issue: "SIN-1" })], snapshot: [snap({ issue: "SIN-2", labels: ["sinan"], open_prs: [{ nummer: 3 } as never] })] };
  const z = alleZeilen(q, PROJEKTE, jetzt);
  const l = z.find((x) => x.projekt.id === "leitstand")!;
  assert.equal(l.phase, "Bauphase");
  assert.equal(l.worker, 1);
  assert.equal(l.prs, 1);
  assert.equal(l.brauchtDich, 1);
  assert.equal(z.find((x) => x.projekt.id === "beleg")!.phase, null);
  assert.equal(projekteSatz(z), "4 Projekte, 1 Worker arbeitet, 1 Aufgabe wartet auf dich.");
  assert.equal(projekteSatz([]), null);
});
