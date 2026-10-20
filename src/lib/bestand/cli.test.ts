import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("SIN-858: echte CLI prüft Cursor, vollständige PR-Seiten, Quellfehler und gezielte Codeauswahl", () => {
  const cwd = mkdtempSync(join(tmpdir(), "bestand-api-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
    mkdirSync(join(cwd, "src"));
    writeFileSync(join(cwd, "src/anderer-name.ts"), "// Bestand aus Inhalt\n");
    writeFileSync(join(cwd, "src/bestand-dateiname.ts"), "// ohne Suchwort im Inhalt\n");
    writeFileSync(join(cwd, "src/unrelated.ts"), "// andere Funktion\n");
    git("add", "."); git("commit", "-qm", "fixture");
    const sha = git("rev-parse", "HEAD");
    const preload = join(cwd, "api.cjs");
    writeFileSync(preload, `
const fs = require('node:fs');
const cp = require('node:child_process');
const original = cp.execFileSync;
const trace = {after:[],pages:[],shows:[]};
const save = () => fs.writeFileSync('trace.json',JSON.stringify(trace));
cp.execFileSync = (cmd,args,options) => {
  if (cmd === 'git' && args[0] === 'show') {
    trace.shows.push(args[1]); save();
    if (args[1].endsWith(':src/unrelated.ts')) throw new Error('Ungezielte Einzeldatei gelesen');
  }
  return original(cmd,args,options);
};
require('node:module').syncBuiltinESMExports();
global.fetch = async (url, init) => {
  const mode = process.env.FIXTURE_MODE;
  if (url.includes('linear.app')) {
    const after = JSON.parse(init.body).variables.after;
    trace.after.push(after); save();
    const index = after === null ? 0 : after === 'c1' ? 1 : 2;
    return Response.json({data:{issues:{nodes:[{identifier:'SIN-'+index,title:'Bestand',description:'Inhalt',url:'https://example.invalid/linear/'+index,state:{type:'started'}}],pageInfo:{hasNextPage:index<2,endCursor:mode==='cursor-missing'?null:mode==='cursor-repeat'?'c1':'c'+(index+1)}}}});
  }
  if (url.includes('/commits/HEAD')) return Response.json({sha:'${sha}'});
  if (url.includes('/contents/')) return Response.json({content:Buffer.from('Bestand Notiz').toString('base64')});
  if (url.includes('/search/issues')) {
    const page = Number(new URL(url).searchParams.get('page'));
    trace.pages.push(page); save();
    return Response.json({incomplete_results:mode==='incomplete',total_count:mode==='search-limit'?1001:101,items:Array.from({length:page===1?100:1},(_,i)=>({number:(page-1)*100+i+1}))});
  }
  if (url.includes('/pulls/')) {
    const n = url.split('/').at(-1);
    return Response.json({title:'Bestand '+n,body:'Inhalt',html_url:'https://example.invalid/pr/'+n,state:'open',merged_at:null,head:{sha:'${sha}'}});
  }
  throw new Error('Unerwartete URL');
};
`);
    for (const mode of ["ok", "incomplete", "search-limit", "cursor-repeat", "cursor-missing"]) {
      const out = join(cwd, "out");
      const r = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), "--require", preload, resolve("scripts/bestand/bestand.ts"), "leitstand", "infra", "Bestand", "bestand"], {
        cwd, encoding: "utf8", timeout: 20000,
        env: { ...process.env, DRY_RUN: "0", BESTAND_FIXTURE: "", BESTAND_CONNECTOR_INPUT: "", BESTAND_AUSGABE: out, GH_TOKEN: "fixture", LINEAR_API_KEY: "fixture", FIXTURE_MODE: mode },
      });
      const b = JSON.parse(readFileSync(join(out, "leitstand-infra.json"), "utf8"));
      const trace = JSON.parse(readFileSync(join(cwd, "trace.json"), "utf8"));
      assert.equal(r.status, mode === "ok" ? 0 : 1, `${mode}: ${r.stdout} ${r.stderr}`);
      assert.equal(b.quellen.find((q: {art: string})=>q.art==='code').status, 'ok');
      assert.equal(trace.shows.length, 2);
      assert.ok(b.vorhandene_bausteine.some((f: {titel:string})=>f.titel==='src/anderer-name.ts'));
      assert.ok(b.vorhandene_bausteine.some((f: {titel:string})=>f.titel==='src/bestand-dateiname.ts'));
      if (mode === 'ok') {
        assert.deepEqual(trace.after, [null, 'c1', 'c2']);
        assert.deepEqual(trace.pages, [1, 2]);
        assert.equal(b.offene_arbeit.filter((f: {quelle:string})=>f.quelle==='prs').length, 101);
        assert.deepEqual(b.quellfehler, []);
      } else {
        const art = mode.startsWith('cursor') ? 'linear' : 'prs';
        assert.equal(b.quellen.find((q: {art:string})=>q.art===art).status, 'fehler');
        assert.ok(!b.offene_arbeit.some((f: {quelle:string})=>f.quelle===art), 'keine Teilmenge als Erfolg');
        assert.match(b.quellfehler.join(), new RegExp(art));
        if (mode==='cursor-repeat') assert.deepEqual(trace.after,[null,'c1']);
        if (mode==='cursor-missing') assert.deepEqual(trace.after,[null]);
      }
    }
  } finally { rmSync(cwd, {recursive:true,force:true}); }
});
