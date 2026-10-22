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

test("Test: Der Prompt-Bau enthält einen Kommentar, der nach dem letzten Haken-Update geschrieben wurde", () => {
  const kommentare = [
    { createdAt: "2026-10-20T08:00:00.000Z", body: "<!-- haken-runde --> Haken-Update" },
    { createdAt: "2026-10-20T09:00:00.000Z", body: "Pause bis morgen" },
    { createdAt: "2026-10-20T10:00:00.000Z", body: "Neue Ursache: Timeout in setGeneratedQuestions" },
    ...[1, 2, 3, 4, 5].map((n) => ({ createdAt: `2026-10-19T0${n}:00:00.000Z`, body: `alt ${n}` })),
  ];
  const text = formatiere({ ...auftrag, comments: { nodes: kommentare } }, [{ created_at: "2026-10-20T11:00:00Z", step: "content-grow", status: "rot", grund: "Timeout" }]);
  const kopf = text.split("\n").filter((z) => z.startsWith("- "));
  assert.match(kopf[0], /Neue Ursache: Timeout/);
  assert.match(text, /Haken-Update/);
  assert.doesNotMatch(text, /Pause bis morgen/);
  assert.doesNotMatch(text, /alt 1/);
  assert.match(text, /content-grow rot: Timeout/);
  assert.ok(text.indexOf("Neueste Kommentare") < text.indexOf("Text mit"));
});

test("Worker darf Läufe lesen, aber nicht schreiben", () => {
  const workflow = readFileSync(".github/workflows/claude.yml", "utf8");
  assert.match(workflow, /Bash\(gh run list:\*\)/);
  assert.match(workflow, /Bash\(gh run view:\*\)/);
  assert.doesNotMatch(workflow, /Bash\(gh (run (rerun|cancel|delete)|api)/);
});

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
