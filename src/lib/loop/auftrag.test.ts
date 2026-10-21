import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatiere } from "./auftrag";
import { issueText } from "./auswahl";

const auftrag = {
  identifier: "SIN-576", title: "Schleife", url: "https://linear.app/x/issue/SIN-576", description: "Text mit \\[nach Aktivierung\\] Haken",
  state: { name: "Todo" }, labels: { nodes: [{ name: "claude" }] },
  inverseRelations: { nodes: [{ type: "blocks", issue: { identifier: "SIN-1", state: { name: "Done" } } }, { type: "related", issue: { identifier: "SIN-2", state: { name: "Todo" } } }] },
  comments: { nodes: [{ createdAt: "2026-10-21T20:00:00.000Z", body: "neueste\nAnweisung" }] },
};

test("Worker liest den Auftrag per Skript, nicht per curl mit Key", () => {
  const text = formatiere(auftrag);
  assert.match(text, /^# SIN-576: Schleife/);
  assert.match(text, /Blocker: SIN-1 \(Done\)/);
  assert.doesNotMatch(text, /SIN-2/);
  assert.match(text, /Text mit \[nach Aktivierung\] Haken/);
  assert.match(text, /- 2026-10-21 20:00: neueste Anweisung/);
  const spiegel = issueText({ identifier: "SIN-576", title: "Schleife", url: auftrag.url, description: "", state: { name: "Todo", type: "unstarted" }, labels: [] } as never);
  assert.match(spiegel.body, /npx tsx scripts\/loop\/auftrag\.ts SIN-576/);
  const workflow = readFileSync(".github/workflows/claude.yml", "utf8");
  assert.match(workflow, /Bash\(npx tsx scripts\/loop\/auftrag\.ts:\*\)/);
  assert.match(workflow, /npx tsx scripts\/loop\/auftrag\.ts <SIN-ID>/);
});
