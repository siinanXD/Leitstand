import assert from "node:assert/strict";
import { test } from "node:test";
import { abhaengigkeiten, graph, zeitpunkte } from "./ablauf";
import { alleProjekte, DISPATCHER_REGEL, nurProjekt, platzReihenfolge } from "./projekte";
import { parseEvents, parseSnapshot } from "./uebersicht";

const t = (min: number) => new Date(Date.UTC(2026, 9, 9, 12, min)).toISOString();

test("parseSnapshot liest issue und blocked_by (Liste oder Text)", () => {
  const [a, b, c] = parseSnapshot([
    { project: "p", issue: "SIN-1", blocked_by: ["SIN-2", " "] },
    { project: "p", issue: "SIN-2", blocked_by: "SIN-3, SIN-4" },
    { project: "p" },
  ]);
  assert.deepEqual(a.blocked_by, ["SIN-2"]);
  assert.deepEqual(b.blocked_by, ["SIN-3", "SIN-4"]);
  assert.deepEqual([c.issue, c.blocked_by], [null, []]);
});

test("abhaengigkeiten: Spalten, kritischer Pfad, braucht dich", () => {
  const s = parseSnapshot([
    { project: "a", issue: "A", status: "done" },
    { project: "a", issue: "B", blocked_by: "A" },
    { project: "b", issue: "C", blocked_by: "B,X", status: "needs_human" },
    { project: "b", issue: "D" },
  ]);
  const d = new Map(abhaengigkeiten(s).map((k) => [k.issue, k]));
  assert.deepEqual([d.get("A")!.spalte, d.get("B")!.spalte, d.get("C")!.spalte, d.get("D")!.spalte], [0, 1, 2, 0]);
  assert.deepEqual([d.get("A")!.kritisch, d.get("B")!.kritisch, d.get("C")!.kritisch, d.get("D")!.kritisch], [true, true, true, false]);
  assert.equal(d.get("C")!.brauchtDich, true);
});

test("abhaengigkeiten: Zyklus bricht nicht, ohne Daten leer", () => {
  const s = parseSnapshot([
    { project: "a", issue: "A", blocked_by: "B" },
    { project: "a", issue: "B", blocked_by: "A" },
  ]);
  assert.equal(abhaengigkeiten(s).length, 2);
  assert.deepEqual(abhaengigkeiten(parseSnapshot([{ project: "a" }])), []);
});

test("platzReihenfolge: Bauphase vor Priorität, unbekannte zuletzt", () => {
  assert.deepEqual(platzReihenfolge(["lernapp", "zzz", "beleg", "leitstand"]), ["leitstand", "beleg", "lernapp", "zzz"]);
  assert.match(DISPATCHER_REGEL, /Bauphase/);
});

test("alleProjekte nimmt neue Projekte aus den Daten auf; nurProjekt filtert", () => {
  assert.deepEqual(alleProjekte(["neu", "beleg"]).map((p) => p.id), ["beleg", "neu"]);
  assert.equal(nurProjekt([{ project: "a" }, { project: "b" }, { project: null }], "a").length, 1);
  assert.equal(nurProjekt([{ project: "a" }], null).length, 1);
});

test("graph: Platz gehört dem laufenden Projekt, Zurückspulen blendet Späteres aus", () => {
  const events = parseEvents([
    { id: 1, created_at: t(0), project: "beleg", step: "work", status: "running" },
    { id: 2, created_at: t(10), project: "beleg", step: "work", status: "done" },
  ]);
  const projekte = alleProjekte(["beleg", "lernapp"]);
  const frueh = graph(events, [], projekte, Date.parse(t(5)), false);
  assert.deepEqual(frueh.plaetze, ["beleg"]);
  assert.ok(frueh.kanten.some((k) => k.von === "platz-1" && k.nach === "beleg-WORK" && k.laeuft));
  assert.equal(frueh.knoten.find((k) => k.id === "beleg-WORK")!.zustand, "laeuft");
  const spaet = graph(events, [], projekte, Date.parse(t(15)), false);
  assert.deepEqual(spaet.plaetze, []);
  assert.equal(spaet.knoten.find((k) => k.id === "beleg-WORK")!.zustand, "fertig");
  assert.equal(spaet.knoten.find((k) => k.id === "lernapp-WORK")!.zustand, "leer");
});

test("zeitpunkte sortiert ohne Doppelte", () => {
  const e = parseEvents([{ created_at: t(5) }, { created_at: t(1) }, { created_at: t(5) }]);
  assert.equal(zeitpunkte(e).length, 2);
});
