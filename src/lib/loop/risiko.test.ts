import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as risiko from "../../../scripts/loop/risiko.mjs";
import { brauchtInhalt, klassifiziere, stufe } from "../../../scripts/loop/risiko.mjs";

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

test("Aufbauphase: keine feste Einspruchsfrist mehr (SIN-855)", () => {
  assert.equal("wartezeitMs" in risiko, false);
  assert.equal("FRIST_MINUTEN" in risiko, false);
});

test("automerge.yml wartet nicht auf Fristen, high ohne freigegeben, no-automerge und Draft bleiben gesperrt", () => {
  const y = readFileSync(new URL("../../../.github/workflows/automerge.yml", import.meta.url), "utf8");
  assert.doesNotMatch(y, /wartezeitMs|setTimeout/);
  assert.match(y, /!pr\.draft/);
  assert.match(y, /no-automerge/);
  // High/Freigabe wird im tatsächlichen Workflow-Harness (aufbauphase.test.ts) geprüft.
  assert.match(y, /labels\.includes\("freigegeben"\)/);
});

test("Stufe: nur Doku/Tests ist low, Code medium, Gate high", () => {
  const f = (filename: string) => ({ filename, status: "modified", patch: "" });
  assert.equal(stufe({ files: [f("docs/x.md"), f("src/lib/a.test.ts")], bekannt }).stufe, "low");
  assert.equal(stufe({ files: [f("docs/x.md"), f("src/lib/a.ts")], bekannt }).stufe, "medium");
  assert.equal(stufe({ files: [], bekannt }).stufe, "medium");
  assert.equal(stufe({ files: [f(".github/workflows/automerge.yml")], bekannt }).stufe, "high");
});

test("Workflow-Änderung ohne erweiterte Rechte ist medium, nie low", () => {
  const f = { filename: ".github/workflows/a.yml", status: "modified", patch: "+      - run: echo hi" };
  assert.equal(stufe({ files: [f], bekannt }).stufe, "medium");
  const rechte = { filename: ".github/workflows/a.yml", status: "modified", patch: "+permissions:\n+  contents: read" };
  assert.equal(stufe({ files: [rechte], bekannt }).stufe, "medium");
  assert.equal(stufe({ files: [{ filename: "scripts/autonomy/risk.mjs", status: "modified", patch: "+x" }], bekannt }).stufe, "medium");
});

test("Doku mit permissions oder Secret ist nicht low", () => {
  const f = { filename: "docs/vorlagen/x.md", status: "modified", patch: "+permissions:\n+  contents: read" };
  assert.equal(stufe({ files: [f], bekannt }).stufe, "medium");
  assert.equal(stufe({ files: [{ filename: "docs/x.md", status: "modified", patch: "+Token: secrets.NEU" }], bekannt }).stufe, "medium");
});

test("nur docs/ ist low", () => {
  assert.equal(stufe({ files: [{ filename: "docs/x.md", status: "modified", patch: "+text" }], bekannt }).stufe, "low");
});

test("SIN-909: drop constraint + add constraint ist kein Datenverlust, drop column schon", () => {
  const mig = (patch: string) => ({ filename: "supabase/migrations/20261021_x.sql", status: "added", patch });
  const ok = "+alter table loop_events drop constraint if exists loop_events_status_check;\n+alter table loop_events add constraint loop_events_status_check check (status in ('a'));\n+drop index if exists x_idx;";
  assert.equal(klassifiziere({ files: [mig(ok)], bekannt }).high, false);
  assert.equal(klassifiziere({ files: [mig("+alter table t drop column c;")], bekannt }).high, true);
  assert.equal(klassifiziere({ files: [mig("+alter table t rename to u;")], bekannt }).high, true);
  assert.equal(klassifiziere({ files: [mig("+drop table t;")], bekannt }).high, true);
});

test("SIN-909: bestandener Prüfer auf dem Head senkt ein gesetztes risk:high", () => {
  const files = [{ filename: "README.md", status: "modified", patch: "+x" }];
  assert.equal(klassifiziere({ files, bekannt, labels: ["risk:high"] }).high, true);
  assert.equal(klassifiziere({ files, bekannt, labels: ["risk:high"], pruefBestanden: true }).high, false);
  // Ein echter Dateigrund bleibt, auch wenn der Prüfer besteht.
  const gate = [{ filename: ".github/workflows/automerge.yml", status: "modified", patch: "+x" }];
  assert.equal(klassifiziere({ files: gate, bekannt, labels: ["risk:high"], pruefBestanden: true }).high, true);
});

test("dispatch.yml startet nach jedem Push auf main, auch bei Merge durch den Agent-Token", () => {
  const y = readFileSync(new URL("../../../.github/workflows/dispatch.yml", import.meta.url), "utf8");
  assert.match(y, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(y, /repository_dispatch:/);
});
