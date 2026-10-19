import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
test('SIN-840: Issue-Zähler überlebt PR-Wechsel; nach zwei Runden needs-human statt drittem Start', () => {
 const dir=mkdtempSync(join(tmpdir(),'repair840-'));
 try {
  const preload=join(dir,'netz.mjs');
  writeFileSync(preload,`
const f=JSON.parse(process.env.FIXTURE);
globalThis.fetch=async(url,init={})=>{
 const ok=v=>new Response(JSON.stringify(v));
 if(url==='https://api.linear.app/graphql'){
  const {query,variables}=JSON.parse(init.body);
  if(query.includes('mutation')){console.log('LINEAR '+JSON.stringify(variables));return ok({data:{issueUpdate:{success:true},commentCreate:{success:true}}});}
  if(query.includes('states {')) return ok({data:{team:{states:{nodes:[{name:'In Progress',id:'progress'}]}}}});
  if(query.includes('team(id:')) return ok({data:{team:{labels:{nodes:[{name:'needs-human',id:'human'}]}}}});
  return ok({data:{issue:{id:'uuid',team:{id:'team'},labels:{nodes:[]},comments:{nodes:f.comments.map(body=>({body})),pageInfo:{hasNextPage:false}}}}});
 }
 if(url.endsWith('/pulls/99'))return ok({title:'fix (SIN-840)',state:'open',labels:[],head:{ref:'claude/sin-840',sha:'new'}});
 if(init.method==='POST'){console.log('GITHUB '+JSON.stringify(init.body));return ok({});}
 throw new Error('Nicht erlaubter Aufruf '+url);
};`);
  for(const rounds of [0,1,2]){
   const r=spawnSync(process.execPath,['--import','tsx','--import',preload,resolve('scripts/loop/loop.ts'),'reparatur','--pr','99','--lauf','https://github.com/fixture/repo/actions/runs/1','--head','new'],{encoding:'utf8',env:{NODE_ENV:"test",PATH:process.env.PATH,GH_TOKEN:'fixture',LINEAR_API_KEY:'fixture',GITHUB_REPOSITORY:'fixture/repo',FIXTURE:JSON.stringify({comments:Array.from({length:rounds},(_,i)=>'<!-- repair-runde:'+(i+1)+' -->')})}});
   assert.equal(r.status,0,r.stderr+r.stdout);
   if(rounds===2){assert.match(r.stdout,/needs-human/);assert.match(r.stdout,/"l":\["human"\]/);assert.doesNotMatch(r.stdout,/@claude/);assert.match(r.stdout,/Blocker nach zwei/);}
   else {assert.match(r.stdout,new RegExp('repair-runde:'+(rounds+1)));assert.match(r.stdout,/@claude/);assert.match(r.stdout,/Logs\/loop_events/);}
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
