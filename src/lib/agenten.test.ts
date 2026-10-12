import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENTEN, agentGraph, agentKarte, agentenFuer, bahnen, budgetAnteil, kostenText } from "./agenten";
import { parseEvents, parseSnapshot } from "./uebersicht";

const t = (min: number) => new Date(Date.UTC(2026, 9, 9, 12, min)).toISOString();
const bis = Date.parse(t(60));

test("Register: jeder Agent hat Auftrag und Workflows, Content nur für die Lern-App", () => {
  assert.ok(AGENTEN.every((a) => a.auftrag && a.workflows.length > 0));
  assert.ok(!agentenFuer(["beleg"]).some((a) => a.id === "content"));
  assert.ok(agentenFuer(["beleg", "lernapp"]).some((a) => a.id === "content"));
});

test("Agent → Bahn → Zustand aus agent und step", () => {
  const events = parseEvents([
    { created_at: t(1), project: "lernapp", step: "WORKER", status: "running" },
    { created_at: t(2), project: "lernapp", step: "PR-GATE", status: "ok" },
    { created_at: t(3), project: "lernapp", step: "CONTENT", agent: "Content", status: "needs_human" },
  ]);
  const b = new Map(bahnen(events, [], ["lernapp"], bis).map((x) => [x.agent.id, x]));
  assert.equal(b.get("coding")!.zustand, "laeuft");
  assert.deepEqual(b.get("coding")!.knoten.map((k) => k.zustand), ["laeuft", "leer"]);
  assert.equal(b.get("pruefen")!.zustand, "fertig");
  assert.equal(b.get("content")!.zustand, "wartet");
  assert.equal(b.get("video")!.zustand, "leer");
});

test("Zurückspulen: spätere Ereignisse zählen nicht", () => {
  const events = parseEvents([{ created_at: t(10), step: "WORKER", status: "running" }]);
  assert.equal(bahnen(events, [], [], Date.parse(t(5))).find((x) => x.agent.id === "coding")!.zustand, "leer");
});

test("Kosten 7 Tage: Summe, ohne Daten null, ältere zählen nicht", () => {
  const alt = new Date(Date.UTC(2026, 9, 1)).toISOString();
  const events = parseEvents([
    { created_at: t(1), agent: "coding", step: "WORK", status: "ok", cost_usd: 1.5 },
    { created_at: t(2), agent: "coding", step: "WORK", status: "ok", cost_usd: 0.5 },
    { created_at: alt, agent: "coding", step: "WORK", status: "ok", cost_usd: 9 },
    { created_at: t(3), agent: "planer", step: "PLAN", status: "ok" },
  ]);
  const b = new Map(bahnen(events, [], [], bis).map((x) => [x.agent.id, x]));
  assert.equal(b.get("coding")!.kosten7d, 2);
  assert.equal(b.get("planer")!.kosten7d, null);
  assert.equal(b.get("coding")!.agent.budget7d, null);
});

test("Warteschlange: offene Issues der Stufen des Agenten im sichtbaren Projekt", () => {
  const s = parseSnapshot([
    { project: "lernapp", issue: "SIN-1", stage: "WORK", status: "in_progress" },
    { project: "lernapp", issue: "SIN-2", stage: "WORK", status: "done" },
    { project: "beleg", issue: "SIN-3", stage: "WORK" },
    { project: "lernapp", stage: "WORK" },
  ]);
  const coding = bahnen([], s, ["lernapp"], bis).find((x) => x.agent.id === "coding")!;
  assert.deepEqual(coding.warteschlange.map((r) => r.issue), ["SIN-1"]);
});

test("Schritt ohne agent, der mehreren Agenten gehören könnte, wird nicht geraten", () => {
  const reg = [
    { id: "a", name: "A", auftrag: "x", workflows: ["X"], budget7d: null },
    { id: "b", name: "B", auftrag: "y", workflows: ["X"], budget7d: null },
  ];
  const events = parseEvents([{ created_at: t(1), step: "X", status: "ok" }]);
  assert.deepEqual(bahnen(events, [], [], bis, reg).map((x) => x.zustand), ["leer", "leer"]);
});

test("Agent-Karte: Zustand, Aktuell und Fuß aus echten Daten (SIN-505)", () => {
  const events = parseEvents([{ created_at: t(50), project: "lernapp", step: "WORK", agent: "coding", status: "running", issue: "SIN-503", pr: 7, cost_usd: 6.2 }]);
  const s = parseSnapshot([{ project: "lernapp", issue: "SIN-9", stage: "WORK", status: "todo" }]);
  const coding = bahnen(events, s, ["lernapp"], bis).find((x) => x.agent.id === "coding")!;
  const k = agentKarte(coding, bis);
  assert.equal(k.signal, "laeuft");
  assert.equal(k.aktuell, "PR #7 · SIN-503 · LÄUFT · 10 MIN");
  assert.equal(k.fuss, "SCHLANGE 1 · 6,20 $");
  assert.equal(k.budgetAnteil, null);
  assert.equal(kostenText(6.2, 20), "6,20 / 20,00 $");
  assert.equal(budgetAnteil(5, 20), 0.25);
  assert.equal(budgetAnteil(50, 20), 1);
});

test("Agent-Karte ohne Daten: nichts erfunden", () => {
  const k = agentKarte(bahnen([], [], [], bis).find((x) => x.agent.id === "research")!, bis);
  assert.equal(k.signal, "leer");
  assert.equal(k.aktuell, "Keine Daten");
  assert.equal(k.fuss, "SCHLANGE 0");
});

test("Agent-Karte: Fehler wird rot", () => {
  const events = parseEvents([{ created_at: t(1), agent: "pruefen", step: "GATE", status: "failed", pr: 245 }]);
  assert.equal(agentKarte(bahnen(events, [], [], bis).find((x) => x.agent.id === "pruefen")!, bis).signal, "error");
});

test("Graph: Produkt-Bahn nur mit Agenten des Projekts, sonst Hinweis; Kante orange bei laufendem Agent", () => {
  const events = parseEvents([{ created_at: t(55), project: "lernapp", agent: "video", step: "VIDEO", status: "running", issue: "SIN-483" }]);
  const g = agentGraph(events, [], ["lernapp", "leitstand"], bis);
  assert.deepEqual(g.knoten.filter((k) => k.lane === "lernapp").map((k) => k.bahn.agent.id), ["content", "video", "marketing"]);
  assert.equal(g.knoten.filter((k) => k.lane === "leitstand").length, 0);
  assert.ok(g.lanes.find((l) => l.id === "leitstand")!.hinweis);
  assert.equal(g.kanten.filter((k) => k.von.startsWith("kette-") && k.nach.startsWith("kette-")).length, 5);
  const laeuft = new Map(g.kanten.map((x) => [x.id, x.laeuft]));
  assert.equal(laeuft.get("kette-betrieb>lernapp-video"), true);
  assert.equal(laeuft.get("kette-planer>lernapp-content"), false);
});
