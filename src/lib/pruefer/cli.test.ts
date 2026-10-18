import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("Echter CLI-Trockenlauf ohne Netz erzeugt keinen produktiven Review-Kommentar", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pruefer-cli-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
    writeFileSync(join(cwd, "a.txt"), "basis\n"); git("add", "."); git("commit", "-qm", "basis");
    const basis = git("rev-parse", "HEAD");
    writeFileSync(join(cwd, "a.txt"), "head\n"); git("add", "."); git("commit", "-qm", "head");
    const head = git("rev-parse", "HEAD");
    writeFileSync(join(cwd, "gh"), "#!/bin/sh\nprintf '%s' '{\"title\":\"Test\",\"body\":\"\"}'\n", { mode: 0o755 });
    const preload = join(cwd, "offline.cjs");
    writeFileSync(preload, "global.fetch = async () => { throw new Error('Netz im Trockenlauf verboten'); };\n");
    const r = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), "--require", preload, resolve("scripts/pruefer/pruefer.ts"), "827", basis, head], {
      cwd, encoding: "utf8", timeout: 15000,
      env: { ...process.env, PATH: `${cwd}:${process.env.PATH}`, DRY_RUN: "1", PRUEFER_MODELL: "fixture", PRUEFER_PREIS_EIN: "1", PRUEFER_PREIS_AUS: "1", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", GH_TOKEN: "", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(join(cwd, "pruefer-kommentar.md")), false);
    assert.match(readFileSync(join(cwd, "pruefer-trockenlauf.md"), "utf8"), /Trockenlauf.*keine unabhängige Prüfung/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
