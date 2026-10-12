import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENTEN, agentenFuer, bahnen } from "./agenten";
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
