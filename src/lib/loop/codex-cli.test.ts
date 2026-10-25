import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

for (const fall of ["rollen", "belegt", "unbekannt", "app-fehlt", "ohne-rolle", "start-unklar", "claude-pause", "spiegel", "claim", "pr", "idempotent", "nachtrag", "pr-andere-kennung"]) {
  test(`SIN-1052: echter Dispatcher ${fall}, Rollenhinweis vor Start und maximal ein Delegate`, () => {
    const run = spawnSync(process.execPath, ["--import", "./src/lib/loop/fixtures/codex-fetch.mjs", "--import", "tsx", "-e", "process.argv[2]='dispatch'; require('./scripts/loop/loop.ts')"], {
      encoding: "utf8", timeout: 20_000,
      env: { NODE_ENV: "test", PATH: process.env.PATH, CODEX_FALL: fall, GITHUB_REPOSITORY: "siinanXD/Leitstand", LINEAR_API_KEY: "fixture", GH_TOKEN: "fixture", SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture", DRY_RUN: "0" },
    });
    assert.equal(run.error, undefined);
    assert.equal(run.status, fall === "unbekannt" ? 1 : 0, run.stdout + run.stderr);
    const r = JSON.parse(run.stdout.match(/CODEX:(.*)/)![1]) as { delegates: string[]; mutations: { id: string; a?: string[]; r?: string[]; d?: string | null }[] };
    assert.deepEqual(r.delegates, ["rollen", "start-unklar", "claude-pause", "idempotent", "nachtrag", "pr-andere-kennung"].includes(fall) ? ["SIN-1"] : ["ohne-rolle", "spiegel", "claim", "pr"].includes(fall) ? ["SIN-2"] : []);
    if (fall === "app-fehlt" || fall === "ohne-rolle") assert.ok(r.mutations.some(m => m.id === "SIN-1" && m.a?.includes("claude") && m.r?.includes("codex-label")));
    if (fall === "start-unklar") assert.equal(r.mutations.some(m => m.d === null), false, "unclear start never releases a possibly running worker");
  });
}
