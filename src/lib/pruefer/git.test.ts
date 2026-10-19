import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lesePrDiff } from "./git";

test("PR-Prüfskript und Lifecycle-Skript bleiben Daten, Basis-Checkout unverändert", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pruefer-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
    mkdirSync(join(cwd, "scripts/pruefer"), { recursive: true });
    writeFileSync(join(cwd, "scripts/pruefer/pruefer.ts"), "// vertrauenswürdige Basis\n");
    git("add", "."); git("commit", "-qm", "basis"); const basis = git("rev-parse", "HEAD");
    const boese = "require('node:fs').writeFileSync('ausgefuehrt', 'ja')";
    writeFileSync(join(cwd, "scripts/pruefer/pruefer.ts"), boese);
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { postinstall: `node -e \"${boese}\"` } }));
    git("add", "."); git("commit", "-qm", "PR"); const head = git("rev-parse", "HEAD");
    git("checkout", "-q", basis);
    const d = lesePrDiff(basis, head, cwd);
    assert.deepEqual(d.dateien, ["package.json", "scripts/pruefer/pruefer.ts"]);
    assert.match(d.diff, /postinstall/);
    assert.match(d.diff, /ausgefuehrt/);
    assert.equal(git("rev-parse", "HEAD"), basis);
    assert.match(readFileSync(join(cwd, "scripts/pruefer/pruefer.ts"), "utf8"), /vertrauenswürdige Basis/);
    assert.equal(existsSync(join(cwd, "ausgefuehrt")), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("Diff akzeptiert ausschließlich vollständige Commit-SHAs", () => {
  for (const falsch of ["HEAD", "--output=ausgabe", "a".repeat(40) + "\n", "refs/pull/1/head"]) {
    assert.throws(() => lesePrDiff(falsch, "a".repeat(40)), /Commit-SHA/);
    assert.throws(() => lesePrDiff("a".repeat(40), falsch), /Commit-SHA/);
  }
});
