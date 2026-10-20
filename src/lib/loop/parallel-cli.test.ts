import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("SIN-856: echter Dispatch-CLI prüft Claims und unabhängig geladene PR-Dateien", () => {
  const text = execFileSync(process.execPath, ["scripts/loop/parallel-probe.mjs"], { encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, DRY_RUN: "1" } });
  const r = JSON.parse(text);
  assert.equal(r.art, "dispatcher-fixture-kein-live-start");
  assert.equal(r.ok, true);
  assert.equal(r.faelle.length, 8);
});
