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

test("SIN-880: echter CLI mit API-Fixtures prüft Budget, Rückfall, JSON und Ledger", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pruefer-api-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
    writeFileSync(join(cwd, "a.txt"), "basis\n"); git("add", "."); git("commit", "-qm", "basis");
    const basis = git("rev-parse", "HEAD");
    writeFileSync(join(cwd, "a.txt"), "head\n"); git("add", "."); git("commit", "-qm", "head");
    const head = git("rev-parse", "HEAD");
    writeFileSync(join(cwd, "gh"), "#!/bin/sh\nprintf '%s' '{\"title\":\"Test (SIN-880)\",\"body\":\"\"}'\n", { mode: 0o755 });
    const preload = join(cwd, "api.cjs");
    writeFileSync(preload, `
const assert = require('node:assert/strict');
const fs = require('node:fs');
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const mode = process.env.FIXTURE_MODE;
  if (url.includes('linear.app')) return Response.json({data:{issue:{identifier:'SIN-880',title:'Test',description:'Dokumentation prüfen'}}});
  if (url.includes('/rest/v1/loop_events')) {
    fs.writeFileSync('ledger.json', JSON.stringify(body));
    return Response.json({});
  }
  const review = {bestanden:true,funde:[],haken:[]};
  if (url.includes('openai.com')) {
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.max_completion_tokens, 6000);
    if (mode.startsWith('fallback')) return new Response('insufficient_quota sk-fixture-openai', {status:429});
    if (mode === 'http-json') return new Response('');
    return Response.json({choices:[{finish_reason:mode==='length'?'length':'stop',message:{content:mode==='empty'?'':mode==='bad-json'?'{':JSON.stringify(review)}}]});
  }
  if (url.includes('anthropic.com')) {
    if (mode === 'fallback-error') return new Response('invalid_request sk-fixture-anthropic', {status:400});
    return Response.json({stop_reason:mode==='fallback-length'?'max_tokens':'tool_use',content:[{type:'tool_use',input:review}]});
  }
  throw new Error('Unerwartete URL');
};
`);
    const cases = [
      ["ok", 0, /Prüfer: bestanden/],
      ["length", 2, /OpenAI: Tokenbudget/],
      ["empty", 2, /Modellantwort leer/],
      ["bad-json", 2, /Modellantwort enthält ungültiges JSON/],
      ["http-json", 2, /OpenAI: HTTP-Antwort/],
      ["fallback-error", 2, /OpenAI: HTTP 429.*Rückfall: Anthropic: HTTP 400/],
      ["fallback-length", 2, /Anthropic: Tokenbudget/],
      ["fallback-ok", 0, /Prüfer: bestanden/],
    ] as const;
    for (const [mode, status, meldung] of cases) {
      rmSync(join(cwd, "pruefer-kommentar.md"), { force: true });
      const r = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), "--require", preload, resolve("scripts/pruefer/pruefer.ts"), "880", basis, head], {
        cwd, encoding: "utf8", timeout: 15000,
        env: { ...process.env, PATH: `${cwd}:${process.env.PATH}`, FIXTURE_MODE: mode, DRY_RUN: "0", PRUEFER_MODELL: "fixture", PRUEFER_PREIS_EIN: "0.10", PRUEFER_PREIS_AUS: "0.5", OPENAI_API_KEY: "sk-fixture-openai", ANTHROPIC_API_KEY: "sk-fixture-anthropic", LINEAR_API_KEY: "fixture", GH_TOKEN: "", SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" },
      });
      assert.equal(r.status, status, `${mode}: ${r.stdout} ${r.stderr}`);
      assert.match(r.stdout, meldung);
      assert.doesNotMatch(r.stdout + r.stderr, /sk-fixture/);
      const ledger = JSON.parse(readFileSync(join(cwd, "ledger.json"), "utf8"));
      assert.equal(ledger.status, status === 0 ? "ok" : "fehler");
      assert.equal(existsSync(join(cwd, "pruefer-kommentar.md")), status === 0);
      if (status !== 0) assert.match(ledger.grund, meldung);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
