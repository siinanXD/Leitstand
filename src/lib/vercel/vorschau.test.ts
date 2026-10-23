import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sollBauen } from "../../../scripts/vercel-ignore.mjs";

const vorschau = (dateien: string[] | null) => sollBauen({ branch: "claude/x", env: "preview", dateien });

test("Docs-, Workflow- und Skript-Änderungen bauen keine Vorschau", () => {
  assert.equal(vorschau(["docs/abnahme.yml", ".github/workflows/a.yml", "scripts/x.ts", "src/lib/a.ts"]), false);
});

test("UI-Dateien bauen eine Vorschau", () => {
  for (const d of ["src/app/x/page.tsx", "src/components/a.tsx", "public/icon.png", "package.json", "package-lock.json", "next.config.ts", "src/lib/theme.css"]) {
    assert.equal(vorschau([d]), true, d);
  }
});

test("main und Produktion bauen immer", () => {
  assert.equal(sollBauen({ branch: "main", env: "preview", dateien: ["docs/a.md"] }), true);
  assert.equal(sollBauen({ branch: "x", env: "production", dateien: [] }), true);
});

test("nicht lesbarer Diff baut", () => {
  assert.equal(vorschau(null), true);
});

test("vercel.json nutzt das Skript", () => {
  assert.match(JSON.parse(readFileSync("vercel.json", "utf8")).ignoreCommand, /vercel-ignore\.mjs/);
});

test("Erster Push eines Branches (ohne VERCEL_GIT_PREVIOUS_SHA) baut die Vorschau", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, VERCEL_GIT_COMMIT_REF: "claude/x", VERCEL_ENV: "preview" };
  delete env.VERCEL_GIT_PREVIOUS_SHA;
  const lauf = spawnSync(process.execPath, ["scripts/vercel-ignore.mjs"], { env, encoding: "utf8" });
  assert.equal(lauf.status, 1);
});
