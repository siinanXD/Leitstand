import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("Prüfer-CLI liest aktuellen Auftrag, prüft exakten Head und verwirft Änderungen ohne Modellaufruf", () => {
  const dir = mkdtempSync(join(tmpdir(), "sin754-pruefer-"));
  try {
    const preload = join(dir, "netz.mjs");
    writeFileSync(preload, `
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
let gh = 0;
cp.execFileSync = (cmd, args) => {
  if (cmd === "gh") return JSON.stringify({ title: "fix: Auftrag (SIN-830)", body: "Closes #1", headRefOid: process.env.GEANDERT && gh++ ? "neuer-head" : "gepruefter-head" });
  if (cmd === "git") { console.log("DIFF " + args.join(" ")); return args.includes("--name-only") ? "docs/abnahme.yml\\n" : "+ Probe\\n"; }
  throw new Error("Nicht erlaubter Prozess: " + cmd);
};
syncBuiltinESMExports();
globalThis.fetch = async (url) => {
  if (url !== "https://api.linear.app/graphql") throw new Error("Kein Modell-/anderer Netzaufruf erlaubt: " + url);
  return new Response(JSON.stringify({ data: { issue: { id: "uuid", identifier: "SIN-830", title: "Aktuell", description: "- [ ] Aktueller Nachtrag", updatedAt: "t1", team: { id: "t" }, parent: null, comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } }), { status: 200 });
};`);
    for (const geaendert of [false, true]) {
      const cwd = join(dir, geaendert ? "geandert" : "stabil");
      mkdirSync(cwd);
      const r = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), "--import", preload, resolve("scripts/pruefer/pruefer.ts"), "1", "origin/main"], { cwd, encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, DRY_RUN: "1", LINEAR_API_KEY: "fixture", PRUEFER_MODELL: "fixture", PRUEFER_PREIS_EIN: "1", PRUEFER_PREIS_AUS: "1", ...(geaendert ? { GEANDERT: "1" } : {}) } });
      assert.match(r.stdout, /origin\/main\.\.\.gepruefter-head/);
      assert.doesNotMatch(r.stdout, /origin\/main\.\.\.HEAD/);
      assert.equal(r.status, geaendert ? 2 : 0, r.stderr + r.stdout);
      if (geaendert) assert.match(r.stderr, /Head während der Prüfung geändert/);
      else assert.doesNotMatch(readFileSync(join(cwd, "pruefer-kommentar.md"), "utf8"), /pruefer-haken:/, "Trockenlauf darf keinen verwendbaren Abschlussbeleg erzeugen");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
