import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { auftragStand, type Auftrag } from './auftrag';
import { hakenMarker } from './haken';

test('SIN-840 Merge-CLI: nur alle aktuellen Kriterien mit gebundenen Bot-Links erlauben Merge', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sin840-'));
  try {
    const preload = join(dir, 'netz.mjs');
    writeFileSync(preload, `
const f = JSON.parse(process.env.FIXTURE); let gelesen = 0;
globalThis.fetch = async (url, init) => {
 const ok = v => new Response(JSON.stringify(v));
 if (url === 'https://api.linear.app/graphql') {
  const {query, variables} = JSON.parse(init.body);
  if (query.includes('mutation')) { console.log('MUTATION '+JSON.stringify(variables)); return ok({data:{issueUpdate:{success:true},commentCreate:{success:true}}}); }
  if (query.includes('states {')) return ok({data:{team:{states:{nodes:[{name:'In Progress',id:'In Progress'}]}}}});
  const a = {...f.auftrag}; if (f.nachtrag && gelesen++) a.description += '\\n- [ ] D';
  return ok({data:{issue:{...a,updatedAt:'t',comments:{nodes:[],pageInfo:{hasNextPage:false}}}}});
 }
 if (url.endsWith('/pulls/1')) return ok({title:'fix: gate (SIN-840)',body:f.teil?'Part of SIN-840':'Closes #2',state:'open',draft:false,head:{sha:'head',repo:{full_name:'fixture/repo'}},base:{sha:'basis',ref:'main',repo:{full_name:'fixture/repo'}}});
 if (url.endsWith('/issues/1/comments?per_page=100&page=1')) return ok([{user:{login:f.author},body:f.marker}]);
 throw new Error('Unerlaubter Netzaufruf: '+url);
};`);
    const auftrag: Auftrag = { id:'uuid', identifier:'SIN-840', title:'Auftrag', description:'- [ ] A\n- [ ] B\n- [ ] C', team:{id:'team'}, kommentare:[], parent:null };
    for (const variante of ['alle','einer','fremd','alter-head','alte-basis','nachtrag','teil','ohne-kriterien']) {
      const a = variante === 'ohne-kriterien' ? {...auftrag,description:'Keine Kriterien'} : auftrag;
      const belege = (variante === 'einer' ? ['A'] : ['A','B','C']).map(text=>({text,belegt:true,beleg:'https://github.com/fixture/repo/commit/head',art:'code' as const}));
      const marker=hakenMarker(belege,{head:variante==='alter-head'?'alt':'head',basis:variante==='alte-basis'?'alt':'basis',auftrag:auftragStand(a)});
      const r=spawnSync(process.execPath,['--import','tsx','--import',preload,resolve('scripts/loop/loop.ts'),'merge-pruefen','--pr','1'],{encoding:'utf8',env:{NODE_ENV:"test",PATH:process.env.PATH,GH_TOKEN:'fixture',LINEAR_API_KEY:'fixture',GITHUB_REPOSITORY:'fixture/repo',FIXTURE:JSON.stringify({auftrag:a,marker,author:variante==='fremd'?'worker':'github-actions[bot]',nachtrag:variante==='nachtrag',teil:variante==='teil'})}});
      assert.equal(r.status,variante==='nachtrag'?1:0,r.stdout+r.stderr);
      if (variante==='nachtrag') { assert.match(r.stderr,/während Merge-Prüfung geändert/); continue; }
      const result=JSON.parse(r.stdout.trim().split('\n').at(-1)!);
      assert.equal(result.allowed,variante==='alle',variante);
      if(variante==='einer') {assert.deepEqual(result.offen,['B','C']);assert.match(r.stdout,/"s":"In Progress"/);assert.match(r.stdout,/Offene Haken für den nächsten Dispatch/);}
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
