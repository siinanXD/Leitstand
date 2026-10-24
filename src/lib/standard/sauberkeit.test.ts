import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";
import { hinzugefuegteZeilen, leseKnipFunde, neueFunde } from "./sauberkeit";

async function pruefe(datei: string, code: string) {
  process.env.SAUBERKEIT_DATEIEN = datei;
  const { default: konfiguration } = await import(`../../../eslint.config.mjs?${datei}${code.length}`);
  delete process.env.SAUBERKEIT_DATEIEN;
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: konfiguration });
  const [ergebnis] = await eslint.lintText(code, { filePath: datei });
  return ergebnis.messages;
}

const lang = `export function lang() {\n${"  console.log(1);\n".repeat(61)}}\n`;

test("Funktion über 60 Zeilen in geänderter Datei ergibt einen Fehler", async () => {
  const meldungen = await pruefe("src/app/fixture-lang.ts", lang);
  assert.ok(meldungen.some((m) => m.ruleId === "max-lines-per-function" && m.severity === 2));
});

test("Funktion über 60 Zeilen in nicht geänderter Datei bleibt ohne Fehler", async () => {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: (await import("../../../eslint.config.mjs")).default });
  const [ergebnis] = await eslint.lintText(lang, { filePath: "src/app/fixture-lang.ts" });
  assert.equal(ergebnis.messages.length, 0);
});

test("Verzweigungen über 15 ergeben einen Fehler", async () => {
  const code = `export const f = (x: number) => {\n${"  if (x === 1) x++;\n".repeat(16)}  return x;\n};\n`;
  assert.ok((await pruefe("src/app/fixture-komplex.ts", code)).some((m) => m.ruleId === "complexity"));
});

test("Exportierte Funktion in src/lib ohne Doku-Satz wird gemeldet, mit Satz nicht", async () => {
  const ohne = await pruefe("src/lib/fixture-doku.ts", "export function a() { return 1; }\nexport const b = () => 2;\n");
  assert.equal(ohne.filter((m) => m.ruleId === "sauberkeit/doku-satz").length, 2);
  const mit = await pruefe("src/lib/fixture-doku-ok.ts", "/** Gibt eins zurück. */\nexport function a() { return 1; }\n/** Gibt zwei zurück. */\nexport const b = () => 2;\nexport const c = 3;\n");
  assert.equal(mit.filter((m) => m.ruleId === "sauberkeit/doku-satz").length, 0);
});

const diff = "+++ b/src/lib/a.ts\n@@ -1,0 +5,2 @@\n+x\n+y\n@@ -9 +12 @@\n+z\n";
const knip = { issues: [
  { file: "src/lib/a.ts", exports: [{ name: "neu", line: 5 }, { name: "alt", line: 1 }], types: [{ name: "T", line: 12 }] },
  { file: "src/lib/b.ts", files: [{ name: "src/lib/b.ts" }] },
  { file: "src/lib/c.ts", files: [{ name: "src/lib/c.ts" }] },
] };

test("hinzugefuegteZeilen liest die Zeilen aus dem Diff", () => {
  assert.deepEqual([...(hinzugefuegteZeilen(diff).get("src/lib/a.ts") ?? [])], [5, 6, 12]);
});

test("knip-neu: neuer ungenutzter Export und neue ungenutzte Datei sind Funde, Altfunde nicht", () => {
  const funde = neueFunde(leseKnipFunde(knip), ["src/lib/b.ts"], hinzugefuegteZeilen(diff));
  assert.deepEqual(funde.map((f) => `${f.datei}:${f.name}`), ["src/lib/a.ts:neu", "src/lib/a.ts:T", "src/lib/b.ts:(ganze Datei)"]);
});
