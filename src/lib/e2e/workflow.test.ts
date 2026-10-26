import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";

const workflow = readFileSync(new URL("../../../.github/workflows/e2e-strecke.yml", import.meta.url), "utf8");
const definition = parse(workflow) as { on: Record<string, unknown>; jobs: Record<string, { if: string; steps: { uses?: string; run?: string; with?: Record<string, unknown> }[] }> };

test("SIN-1092: E2E-Live-Collector erhält keinen automatischen PR-Auslöser", () => {
  assert.deepEqual(Object.keys(definition.on).sort(), ["schedule", "workflow_dispatch"]);
});

test("SIN-1092: E2E-Secrets nur im Live-Job vom Hauptbranch, ohne Checkout-Credentials", () => {
  const job = definition.jobs["e2e-strecke"];
  assert.ok(job.if, "Ohne Job-Sperre wäre ein manueller Branch-Start erlaubt");
  for (const event_name of ["schedule", "workflow_dispatch", "pull_request", "pull_request_target"]) {
    for (const ref of ["refs/heads/main", "refs/heads/codex/test", "refs/pull/1/merge"]) {
      const erwartet = ref === "refs/heads/main" && ["schedule", "workflow_dispatch"].includes(event_name);
      assert.equal(runInNewContext(job.if, { github: { ref, event_name } }), erwartet, `${event_name}: ${ref}`);
    }
  }
  assert.equal(job.steps.find((s) => s.uses?.startsWith("actions/checkout@"))?.with?.["persist-credentials"], false);
  assert.ok(job.steps.some((s) => s.run?.startsWith("npm ci --ignore-scripts")));
});

test("SIN-1092: build führt die E2E-Workflow-Gegenprobe auch bei reinen YAML-Änderungen aus", () => {
  const build = parse(readFileSync(new URL("../../../.github/workflows/build.yml", import.meta.url), "utf8")) as typeof definition;
  const probe = build.jobs.build.steps.find((s) => s.run?.includes("src/lib/e2e/workflow.test.ts"));
  assert.ok(probe, "Importbasierte Auswahl kennt keine YAML-Abhängigkeit: expliziter CI-Schritt nötig");
  assert.ok(!("if" in probe), "Sicherheitsprobe darf nicht von betroffenen TS-Dateien abhängen");
});
