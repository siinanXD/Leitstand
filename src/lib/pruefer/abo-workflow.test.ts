import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(".github/workflows/pruefer.yml", "utf8");
test("Abo-only-Workflow reicht keine Modell-API-Zugangsdaten oder API-Modellkonfiguration weiter", () => {
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|ANTHROPIC_API_KEY|PRUEFER_PREIS_|PRUEFER_CLAUDE_MODELL/);
});
test("Alle nativen Anstöße sind serialisiert und neue Basis muss die native CLI besitzen", () => {
  assert.match(workflow, /group: pruefer-abo\n  cancel-in-progress: false/);
  assert.match(workflow, /test -f src\/lib\/pruefer\/codex.ts/);
});
test("Native Folgerunden laufen auf main; fehlender Review ist kein automatischer Reparaturfehler", () => {
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /pruefer-nachlauf.ts/);
  assert.match(workflow, /steps.lauf.outputs.wartend != 'true'/);
});

test("Globale Serialisierung erhält mehrere wartende Prüfläufe statt sie gegenseitig zu ersetzen", () => {
  const abschnitt = workflow.split("concurrency:\n")[1].split("jobs:\n")[0];
  assert.match(abschnitt, /queue: max/);
  assert.match(abschnitt, /cancel-in-progress: false/);
});
