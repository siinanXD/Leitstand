import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const vitrine = JSON.parse(readFileSync("docs/vitrine.json", "utf8")) as Record<string, { description: string; topics: string[] }>;

test("Test: Vitrine nennt Beschreibung und gültige Topics für Leitstand, Lern-App und stromlauf-ai (SIN-739)", () => {
  assert.deepEqual(Object.keys(vitrine).sort(), ["siinanXD/Content-Agent-Lernapp", "siinanXD/Leitstand", "siinanXD/stromlauf-ai"]);
  for (const [repo, { description, topics }] of Object.entries(vitrine)) {
    assert.ok(description.length > 40 && description.length <= 350, `${repo}: Beschreibung`);
    assert.ok(topics.length >= 3 && topics.length <= 20, `${repo}: Anzahl Topics`);
    for (const t of topics) assert.match(t, /^[a-z0-9][a-z0-9-]{0,49}$/, `${repo}: Topic ${t}`);
  }
});

test("vitrine.yml liest die Datei, schreibt nur Metadaten und hat keine write-Rechte", () => {
  const yml = readFileSync(".github/workflows/vitrine.yml", "utf8");
  assert.ok(yml.includes("docs/vitrine.json"));
  assert.ok(yml.includes("AGENT_WORKFLOW_TOKEN"));
  assert.doesNotMatch(yml, /:\s*write/);
  assert.doesNotMatch(yml, /pull_request_target/);
});
