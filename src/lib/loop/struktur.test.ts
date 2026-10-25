import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { ESLint } from "eslint";

test("SIN-1052: Loop-Module erfüllen die geltenden Größen- und Komplexitätsgrenzen", async () => {
  const dateien = ["loop", "netz", "linear-netz", "reservierung-netz", "codex", "dispatch", "abschluss"]
    .map((name) => `scripts/loop/${name}.ts`).filter(existsSync);
  dateien.push("src/lib/loop/fixtures/codex-fetch.mjs");
  process.env.SAUBERKEIT_DATEIEN = dateien.join("\n");
  const konfigurationsPfad = "../../../eslint.config.mjs?loop-struktur";
  const { default: konfiguration } = await import(konfigurationsPfad);
  delete process.env.SAUBERKEIT_DATEIEN;
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: konfiguration });
  const ergebnisse = await eslint.lintFiles(dateien);
  const fehler = ergebnisse.flatMap((e) => e.messages.filter((m) => m.severity === 2).map((m) => `${e.filePath}:${m.line} ${m.ruleId}: ${m.message}`));
  assert.deepEqual(fehler, []);
});
