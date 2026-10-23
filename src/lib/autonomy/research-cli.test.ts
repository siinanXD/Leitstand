import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const script = resolve("scripts/autonomy/research.ts");
const tsx = resolve("node_modules/tsx/dist/loader.mjs");

test("Research-CLI startet trocken ohne Netz und schreibt erst nach beiden Quellen", () => {
  const cwd = mkdtempSync(join(tmpdir(), "leitstand-research-"));
  try {
    mkdirSync(join(cwd, "docs/decisions"), { recursive: true });
    mkdirSync(join(cwd, "docs/schemas"));
    copyFileSync(resolve("docs/schemas/research.json"), join(cwd, "docs/schemas/research.json"));
    const preload = join(cwd, "fetch.cjs");
    writeFileSync(preload, `global.fetch = async (url) => {
      if (process.env.DRY_RUN === '1') throw new Error('Netz im Trockenlauf');
      if (url.startsWith('https://api.github.com/search/repositories?'))
        return {ok: true, json: async () => ({items: [{full_name: 'beispiel/repo', html_url: 'https://github.com/beispiel/repo', stargazers_count: 600}]})};
      if (url.startsWith('https://huggingface.co/api/models?'))
        return {ok: true, json: async () => process.env.LEER === '1' ? [] : [{id: 'beispiel/modell', likes: 2}]};
      throw new Error('Unerlaubtes Netz-Ziel');
    };`);
    const lauf = (env: Record<string, string>) => spawnSync(process.execPath, ["--import", tsx, "--require", preload, script, "SIN-826", "agent tools"], {
      cwd, encoding: "utf8", timeout: 15000, env: { ...process.env, GITHUB_TOKEN: "", DRY_RUN: "0", ...env },
    });
    const trocken = lauf({ DRY_RUN: "1" });
    assert.equal(trocken.status, 0, trocken.stderr);
    assert.match(trocken.stdout, /Trockenlauf/);
    assert.deepEqual(readdirSync(join(cwd, "docs/decisions")), []);
    const leer = lauf({ LEER: "1" });
    assert.equal(leer.status, 1, leer.stderr);
    assert.match(leer.stderr, /Kein Treffer bei huggingface/);
    assert.deepEqual(readdirSync(join(cwd, "docs/decisions")), []);
    const erfolg = lauf({ LEER: "0" });
    assert.equal(erfolg.status, 0, erfolg.stderr);
    const bericht = readFileSync(join(cwd, "docs/decisions/SIN-826-research.md"), "utf8");
    assert.match(bericht, /beispiel\/repo/);
    assert.match(bericht, /beispiel\/modell/);
    const ergebnis = JSON.parse(readFileSync(join(cwd, "docs/autonomy/laeufe/SIN-826.json"), "utf8"));
    assert.equal(ergebnis.rolle, "research");
    assert.deepEqual(ergebnis.treffer.map((t: { name: string }) => t.name), ["beispiel/repo", "beispiel/modell"]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
