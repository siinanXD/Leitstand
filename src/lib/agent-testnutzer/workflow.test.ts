import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const yml = readFileSync(".github/workflows/agent-testnutzer.yml", "utf8");
const job = (name: string) => {
  const start = yml.indexOf(`\n  ${name}:`);
  assert.ok(start >= 0, `Job ${name} fehlt`);
  const rest = yml.slice(start + 1);
  const ende = rest.slice(1).search(/\n {2}\S/);
  return ende < 0 ? rest : rest.slice(0, ende + 1);
};

test("pull_request-Job nutzt kein Secret", () => {
  assert.doesNotMatch(job("pruefen"), /secrets\./);
  assert.match(job("pruefen"), /DRY_RUN: "1"/);
});

test("Job mit Secrets läuft nie bei pull_request und checkt main aus", () => {
  const smoke = job("smoke");
  assert.match(smoke, /github\.event_name != 'pull_request'/);
  assert.match(smoke, /ref: main/);
});
