import { test } from "node:test";
import assert from "node:assert/strict";
import { ladeProjektIssues, type ProjektKnoten } from "./projekt-issues";
import { ausLinear } from "./auswahl";

const knoten = (id: string): ProjektKnoten => ({
  id, identifier: id, title: id, url: "https://linear.app/issue/" + id,
  createdAt: "2026-10-18", startedAt: "2026-10-18", team: { id: "team" },
  state: { type: "started" }, labels: { nodes: [{ name: "claude" }] },
  inverseRelations: { nodes: [{ type: "blocks", issue: { identifier: "SIN-1", state: { type: "started" } } }] },
});

test("liest kleine Seiten vollständig und erhält Team, Labels und Blocker", async () => {
  const cursors: unknown[] = [];
  const nodes = [knoten("SIN-2"), knoten("SIN-3")];
  const result = await ladeProjektIssues(async (query, variables) => {
    assert.match(query, /issues\(first: 25, after: \$after/);
    assert.equal(variables.p, "Leitstand");
    cursors.push(variables.after);
    const index = variables.after === null ? 0 : 1;
    return { issues: { nodes: [nodes[index]], pageInfo: { hasNextPage: index === 0, endCursor: index === 0 ? "next" : null } } };
  }, "Leitstand");
  assert.deepEqual(cursors, [null, "next"]);
  assert.deepEqual(result, nodes);
  assert.equal(result[1].team.id, "team");
  assert.deepEqual(ausLinear(result[1]).blockiertVon, [{ identifier: "SIN-1", stateType: "started" }]);
  assert.deepEqual(ausLinear(result[1]).labels, ["claude"]);
});

test("leeres Projekt liefert keine Issues", async () => {
  assert.deepEqual(await ladeProjektIssues(async () => ({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }), "Leitstand"), []);
});

test("Fehler auf Folgeseite liefert keinen unvollständigen Plan", async () => {
  await assert.rejects(ladeProjektIssues(async (_query, variables) => {
    if (variables.after) throw new Error("Linear: 400");
    return { issues: { nodes: [knoten("SIN-2")], pageInfo: { hasNextPage: true, endCursor: "next" } } };
  }, "Leitstand"), /Linear: 400/);
});

test("fehlender oder wiederholter Cursor bricht ab statt endlos zu lesen", async () => {
  for (const endCursor of [null, "next"]) {
    await assert.rejects(ladeProjektIssues(async () => ({ issues: { nodes: [], pageInfo: { hasNextPage: true, endCursor } } }), "Leitstand"), /Cursor/);
  }
});
