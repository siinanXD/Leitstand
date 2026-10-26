import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
// SIN-905: statische Abhängigkeiten der als Unterprozess ausgeführten CLIs, ohne Laufzeitausführung beim Import.
import type {} from "../../../scripts/pruefer/pruefer";
import type {} from "../../../scripts/pruefer/pruefer-nachlauf";
import { kriterienHash } from "../../../scripts/loop/beleg-stand.mjs";

const ghFixture = `#!/usr/bin/env node
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.ABO_FIXTURE, 'utf8'));
const route = process.argv[3];
const owner = {login:'siinanXD',type:'User'};
const bot = {login:'chatgpt-codex-connector[bot]',type:'Bot'};
const stamp = new Date(Date.now()-60000).toISOString();
const request = {id:1,body:'<!-- codex-anforderung:v1 '+JSON.stringify(s.stand)+' -->',created_at:stamp,updated_at:stamp,user:owner};
const code = {code_review:{commit_sha:s.stand.head,status:'completed',has_any_findings:s.mode==='funde',has_unresolved_findings:s.mode==='funde'}};
const result = {bestanden:true,funde:[],haken:[{text:'Test besteht',belegt:true,beleg:'a.txt:1'}]};
const review = {id:2,body:'<!-- codex-review-state:v1 '+JSON.stringify(code)+' -->\\n<!-- codex-kriterien:v1 '+JSON.stringify({...s.stand,ergebnis:result})+' -->',created_at:stamp,updated_at:new Date().toISOString(),user:bot};
let out;
if(s.mode==='fehler') throw new Error('Fixture-Transportfehler');
if (process.argv.includes('POST')) {s.starts.push(JSON.parse(fs.readFileSync(0,'utf8')).body);fs.writeFileSync(process.env.ABO_FIXTURE,JSON.stringify(s));out={};}
else if (route.includes('/pulls?')) out=[[{number:880,draft:false,labels:[],head:{sha:s.stand.head,ref:'codex/sin-880',repo:{full_name:s.repo}}}]];
else if (route.endsWith('/pulls/880')) out={title:'Test (SIN-880)',body:'',state:'open',draft:false,head:{sha:s.stand.head,repo:{full_name:s.repo}},base:{sha:s.stand.basis,ref:'main',repo:{full_name:s.repo}}};
else if (route.endsWith('/branches/main')) out={protected:true,commit:{sha:s.stand.basis}};
else if (route.includes('/pulls/880/reviews')) out=[[]];
else if (route.includes('/issues/880/comments')) out=[s.mode==='anfordern'?[]:s.mode==='warten'?[request]:[request,review]];
else if (route.includes('/issues/comments?since=')) out=[[request]];
else throw new Error('Nicht erlaubte Fixture-Route');
console.log(JSON.stringify(out));
`;
const preload = `global.fetch = async (url) => {
  if (url !== 'https://api.linear.app/graphql') throw new Error('Kein Modell-API-/Netzzugriff erlaubt');
  return Response.json({data:{issue:{identifier:'SIN-880',title:'Test',description:'- [ ] Test besteht'}}});
};`;

function bereiteFixtureVor() {
  const cwd = mkdtempSync(join(tmpdir(), "pruefer-abo-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", timeout: 5000 }).trim();
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  writeFileSync(join(cwd, "a.txt"), "basis\n"); git("add", "."); git("commit", "-qm", "basis");
  const basis = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, "a.txt"), "head\n"); git("add", "."); git("commit", "-qm", "head");
  const head = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, "gh"), ghFixture, { mode: 0o755 });
  writeFileSync(join(cwd, "offline.cjs"), preload);
  return { cwd, basis, head };
}

function starteFixture(f: ReturnType<typeof bereiteFixtureVor>, mode: string, trocken = false, skript = "scripts/pruefer/pruefer.ts") {
  const file = join(f.cwd, "state.json");
  writeFileSync(file, JSON.stringify({ repo: "siinanXD/Leitstand", mode, starts: [], stand: { head: f.head, basis: f.basis, auftrag: kriterienHash("SIN-880\nTest\n- [ ] Test besteht") } }));
  const run = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), "--require", join(f.cwd, "offline.cjs"), resolve(skript), "880", f.basis, f.head], {
    cwd: f.cwd, encoding: "utf8", timeout: 15000,
    env: { ...process.env, PATH: `${f.cwd}:${process.env.PATH}`, ABO_FIXTURE: file, GH_REPO: "siinanXD/Leitstand", DRY_RUN: trocken ? "1" : "0", LINEAR_API_KEY: "fixture", OPENAI_API_KEY: "sk-verboten", ANTHROPIC_API_KEY: "sk-verboten", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
  });
  return { run, state: JSON.parse(readFileSync(file, "utf8")) };
}

test("Echte Abo-only-CLI: Anstoß, Warten, Kriterienbeleg, Codefund und Trockenlauf ohne Modell-API", () => {
  const f = bereiteFixtureVor();
  try {
    for (const mode of ["anfordern", "warten", "fertig", "funde", "trocken"]) {
      for (const name of ["pruefer-kommentar.md", "pruefer-trockenlauf.md", "pruefer-status.txt", "pruefer-hoch.txt"]) rmSync(join(f.cwd, name), { force: true });
      const { run, state } = starteFixture(f, mode, mode === "trocken");
      assert.equal(run.status, mode === "funde" ? 1 : 0, `${mode}: ${run.stdout} ${run.stderr}`);
      assert.equal(state.starts.length, mode === "anfordern" ? 1 : 0);
      assert.doesNotMatch(run.stdout + run.stderr, /sk-verboten/);
      const datei = join(f.cwd, mode === "trocken" ? "pruefer-trockenlauf.md" : "pruefer-kommentar.md");
      const text = readFileSync(datei, "utf8");
      assert.match(text, /Reviewer: Codex \(Abo\)/);
      assert.equal(text.includes("<!-- pruefer-stand:"), mode === "fertig");
      if (mode === "trocken") assert.equal(existsSync(join(f.cwd, "pruefer-kommentar.md")), false);
    }
  } finally { rmSync(f.cwd, { recursive: true, force: true }); }
});


test("Fehlgeschlagener neuer CLI-Lauf lässt keinen alten Freigabekommentar liegen", () => {
  const f = bereiteFixtureVor();
  try {
    assert.equal(starteFixture(f, "fertig").run.status, 0);
    assert.equal(existsSync(join(f.cwd, "pruefer-kommentar.md")), true);
    assert.equal(starteFixture(f, "fehler").run.status, 2);
    assert.equal(existsSync(join(f.cwd, "pruefer-kommentar.md")), false);
    assert.equal(existsSync(join(f.cwd, "pruefer-status.txt")), false);
  } finally { rmSync(f.cwd, { recursive: true, force: true }); }
});


test("Echter Nachlauf-Trockenlauf liest neue native Antwort ohne produktiven Dispatch", () => {
  const f = bereiteFixtureVor();
  try {
    const { run, state } = starteFixture(f, "fertig", true, "scripts/pruefer/pruefer-nachlauf.ts");
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /trocken.*vorhandene Prüfung/);
    assert.equal(state.starts.length, 0);
  } finally { rmSync(f.cwd, { recursive: true, force: true }); }
});
