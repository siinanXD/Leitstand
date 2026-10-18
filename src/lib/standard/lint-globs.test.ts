import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { ESLint } from "eslint";

// Prüft die vorhandene Begrenzung, repariert nicht GHSA-vfj7-8cjw-p6xm.
test("Next-Lint verwendet ohne rootDir-Override keinen fast-glob-Eingang", async () => {
  const require = createRequire(import.meta.url);
  const glob = require("fast-glob");
  const { getRootDirs } = require("@next/eslint-plugin-next/dist/utils/get-root-dirs");
  const original = glob.globSync;
  const blocked = new Error("Glob-Eingang erreicht");
  glob.globSync = () => { throw blocked; };
  try {
    const eslint = new ESLint();
    for (const file of ["src/app/page.tsx", "src/lib/standard/muster.ts", "eslint.config.mjs"]) {
      const config = await eslint.calculateConfigForFile(file);
      assert.ok(config, `Keine Konfiguration für ${file}`);
      assert.equal(config.settings?.next?.rootDir, undefined);
      assert.deepEqual(getRootDirs({ cwd: process.cwd(), settings: config.settings }), [process.cwd()]);
    }
    // Negative Kontrolle: eine spätere Glob-Konfiguration erreicht den Sensor.
    assert.throws(() => getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: "src/**" } } }), (error) => error === blocked);
  } finally {
    glob.globSync = original;
  }
});
