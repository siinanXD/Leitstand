import assert from "node:assert/strict";
import { test } from "node:test";
import { ausLinear, gespiegelteIds, issueText, linearId, marker, nachruecken, reparatur, waehle, type LinearIssue } from "./auswahl";

const issue = (o: Partial<LinearIssue> & { identifier: string }): LinearIssue => ({
  id: o.identifier,
  title: "Titel",
  description: null,
  priority: 3,
  url: `https://linear.app/x/issue/${o.identifier}`,
  createdAt: "2026-10-01T00:00:00Z",
  labels: ["claude"],
  stateType: "unstarted",
  blockiertVon: [],
  ...o,
});

test("linearId findet die erste Kennung", () => {
  assert.equal(linearId("fix(uebersicht): Spalten (SIN-410)"), "SIN-410");
  assert.equal(linearId("ohne Kennung"), null);
  assert.equal(linearId(null), null);
});

test("gespiegelteIds liest nur die Markierung", () => {
  const ids = gespiegelteIds([
    { number: 1, body: `${marker("SIN-410")}\nText`, state: "open" },
    { number: 2, body: "SIN-999 im Text, ohne Markierung", state: "closed" },
    { number: 3, body: null, state: "open" },
  ]);
  assert.deepEqual([...ids], ["SIN-410"]);
});

test("waehle: nur Todo mit Label claude, nicht blockiert, nicht gespiegelt, nach Priorität", () => {
  const issues = [
    issue({ identifier: "SIN-1", priority: 3 }),
    issue({ identifier: "SIN-2", priority: 1 }),
    issue({ identifier: "SIN-3", labels: ["design"] }),
    issue({ identifier: "SIN-4", stateType: "backlog" }),
    issue({ identifier: "SIN-5", blockiertVon: [{ identifier: "SIN-9", stateType: "unstarted" }] }),
    issue({ identifier: "SIN-6", blockiertVon: [{ identifier: "SIN-9", stateType: "completed" }], priority: 0 }),
    issue({ identifier: "SIN-7" }),
  ];
  const r = waehle(issues, new Set(["SIN-7"]), 5).map((i) => i.identifier);
  assert.deepEqual(r, ["SIN-2", "SIN-1", "SIN-6"]);
});

test("waehle: laufende Issues zählen gegen das Limit", () => {
  const issues = [issue({ identifier: "SIN-1", stateType: "started" }), issue({ identifier: "SIN-2" })];
  assert.deepEqual(waehle(issues, new Set(), 1), []);
  assert.deepEqual(waehle(issues, new Set(), 2).map((i) => i.identifier), ["SIN-2"]);
});

test("issueText enthält Markierung, Link und Branch-Regel", () => {
  const t = issueText(issue({ identifier: "SIN-410", title: "Spalten", description: "Beschreibung" }));
  assert.equal(t.title, "SIN-410: Spalten");
  assert.ok(t.body.startsWith(marker("SIN-410")));
  assert.match(t.body, /claude\/sin-410/);
  assert.match(t.body, /Beschreibung/);
});

test("reparatur: drei Runden, dann Stopp", () => {
  assert.deepEqual(reparatur([]), { runde: 1 });
  assert.deepEqual(reparatur(["repair:1"]), { runde: 2 });
  assert.deepEqual(reparatur(["repair:1", "repair:2"]), { runde: 3 });
  assert.deepEqual(reparatur(["repair:3"]), { stopp: true });
  assert.deepEqual(reparatur(["needs-human"]), { stopp: true });
});

test("ausLinear übernimmt Labels, Status und Blocker", () => {
  const i = ausLinear({
    id: "x",
    identifier: "SIN-1",
    title: "T",
    url: "u",
    createdAt: "2026-10-01T00:00:00Z",
    labels: { nodes: [{ name: "claude" }] },
    state: { type: "unstarted" },
    inverseRelations: {
      nodes: [
        { type: "blocks", issue: { identifier: "SIN-2", state: { type: "started" } } },
        { type: "related", issue: { identifier: "SIN-3", state: { type: "started" } } },
      ],
    },
  });
  assert.deepEqual(i.labels, ["claude"]);
  assert.equal(i.priority, 0);
  assert.deepEqual(i.blockiertVon, [{ identifier: "SIN-2", stateType: "started" }]);
});

test("nachruecken: wichtigstes Backlog-Issue ohne Design, Sinan-Aufgabe oder Blocker", () => {
  const issues = [
    issue({ identifier: "SIN-10", stateType: "backlog", labels: [], priority: 3, createdAt: "2026-10-01T00:00:00Z" }),
    issue({ identifier: "SIN-11", stateType: "backlog", labels: ["design"], priority: 1 }),
    issue({ identifier: "SIN-12", stateType: "backlog", labels: [], priority: 2 }),
    issue({ identifier: "SIN-13", stateType: "backlog", labels: ["sinan"], priority: 1 }),
    issue({ identifier: "SIN-14", stateType: "backlog", labels: [], priority: 1, blockiertVon: [{ identifier: "SIN-9", stateType: "started" }] }),
  ];
  assert.equal(nachruecken(issues, new Set(), 1)?.identifier, "SIN-12");
});

test("nachruecken: nichts, solange ein Todo wartet oder kein Platz frei ist", () => {
  const backlog = issue({ identifier: "SIN-20", stateType: "backlog", labels: [] });
  assert.equal(nachruecken([backlog, issue({ identifier: "SIN-21" })], new Set(), 1), null);
  assert.equal(nachruecken([backlog, issue({ identifier: "SIN-22", stateType: "started" })], new Set(), 1), null);
  assert.equal(nachruecken([backlog], new Set(), 1)?.identifier, "SIN-20");
});
