import assert from "node:assert/strict";
import { test } from "node:test";
import { betroffeneTests, importPfade, loeseAuf } from "./betroffene-tests";

const dateien = new Set([
  "src/lib/supabase.ts",
  "src/lib/abnahme/abnahme.ts",
  "src/lib/abnahme/abnahme.test.ts",
  "src/lib/abnahme/index.ts",
  "src/lib/kosten/kosten.ts",
  "src/lib/kosten/kosten.test.ts",
  "src/lib/andere/andere.ts",
  "src/lib/andere/andere.test.ts",
]);
const importe = {
  "src/lib/abnahme/abnahme.test.ts": ["node:test", "./abnahme"],
  "src/lib/abnahme/abnahme.ts": ["@/lib/supabase"],
  "src/lib/kosten/kosten.ts": ["../abnahme/abnahme"],
  "src/lib/kosten/kosten.test.ts": ["./kosten"],
  "src/lib/andere/andere.ts": [],
  "src/lib/andere/andere.test.ts": ["./andere"],
};

test("importPfade findet statische, dynamische und Re-Exporte", () => {
  const q = `import a from "./a";\nexport * from "../b";\nconst c = await import("@/lib/c");\nimport "d";`;
  assert.deepEqual(importPfade(q).sort(), ["../b", "./a", "@/lib/c", "d"]);
});

test("loeseAuf: relativ, Alias, Index, Paket, unbekannt", () => {
  assert.equal(loeseAuf("src/lib/kosten/kosten.ts", "../abnahme/abnahme", dateien), "src/lib/abnahme/abnahme.ts");
  assert.equal(loeseAuf("src/lib/x.ts", "@/lib/supabase", dateien), "src/lib/supabase.ts");
  assert.equal(loeseAuf("src/lib/x.ts", "@/lib/abnahme", dateien), "src/lib/abnahme/index.ts");
  assert.equal(loeseAuf("src/lib/x.ts", "react", dateien), null);
  assert.equal(loeseAuf("src/lib/x.ts", "./fehlt", dateien), null);
});

test("abnahme.ts → abnahme.test.ts und Tests, die abnahme.ts importieren", () => {
  const r = betroffeneTests(["src/lib/abnahme/abnahme.ts"], importe, dateien);
  assert.equal(r.alle, false);
  assert.deepEqual(r.tests, ["src/lib/abnahme/abnahme.test.ts", "src/lib/kosten/kosten.test.ts"]);
});

test("gemeinsame Datei supabase.ts → alle Tests, die sie transitiv importieren", () => {
  const r = betroffeneTests(["src/lib/supabase.ts"], importe, dateien);
  assert.deepEqual(r.tests, ["src/lib/abnahme/abnahme.test.ts", "src/lib/kosten/kosten.test.ts"]);
});

test("geänderter Test läuft selbst, Unbeteiligte nicht", () => {
  const r = betroffeneTests(["src/lib/andere/andere.test.ts"], importe, dateien);
  assert.deepEqual(r.tests, ["src/lib/andere/andere.test.ts"]);
});

test("package-lock oder build.yml → volle Testreihe", () => {
  assert.equal(betroffeneTests(["package-lock.json"], importe, dateien).alle, true);
  assert.equal(betroffeneTests([".github/workflows/build.yml"], importe, dateien).alle, true);
});

test("nur Doku geändert → keine Tests", () => {
  const r = betroffeneTests(["docs/x.md"], importe, dateien);
  assert.equal(r.alle, false);
  assert.deepEqual(r.tests, []);
});
