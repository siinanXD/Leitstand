import { test } from "node:test";
import assert from "node:assert/strict";
import { brauchtInhalt, klassifiziere } from "../../../scripts/loop/risiko.mjs";

const bekannt = new Set<string>();
const WRITE = "name: x\npermissions:\n  contents: write\njobs: {}\n";

test("umbenannte .vorlage mit write nach .github/workflows/ ist risk:high", () => {
  const f = { filename: ".github/workflows/neu.yml", previous_filename: "docs/vorlagen/neu.vorlage", status: "renamed", inhalt: WRITE };
  assert.equal(brauchtInhalt(f), true);
  const r = klassifiziere({ files: [f], bekannt });
  assert.equal(r.high, true);
  assert.match(r.gruende[0], /Workflow-Recht erweitert/);
});

test("kopierte und neue Workflows werden komplett geprüft", () => {
  for (const status of ["copied", "added"]) {
    const f = { filename: ".github/workflows/a.yml", previous_filename: status === "copied" ? "x.yml" : undefined, status, inhalt: WRITE };
    assert.equal(klassifiziere({ files: [f], bekannt }).high, true);
  }
});

test("Umbenennung innerhalb von .github/workflows/ prüft nur den Diff", () => {
  const f = { filename: ".github/workflows/b.yml", previous_filename: ".github/workflows/a.yml", status: "renamed", inhalt: WRITE };
  assert.equal(brauchtInhalt(f), false);
  assert.equal(klassifiziere({ files: [f], bekannt }).high, false);
});

test("umbenannte Datei ohne Rechte bleibt medium", () => {
  const f = { filename: ".github/workflows/c.yml", previous_filename: "c.vorlage", status: "renamed", inhalt: "permissions:\n  contents: read\n" };
  assert.equal(klassifiziere({ files: [f], bekannt }).high, false);
});

test("von Hand gesetztes risk:high bleibt stehen", () => {
  const r = klassifiziere({ files: [{ filename: "README.md", status: "modified", patch: "+x" }], bekannt, labels: ["risk:high"] });
  assert.equal(r.high, true);
});

test("ohne Label und ohne Befund: medium", () => {
  assert.equal(klassifiziere({ files: [{ filename: "README.md", status: "modified", patch: "+x" }], bekannt }).high, false);
});
