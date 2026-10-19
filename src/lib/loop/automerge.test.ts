import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const yaml=readFileSync('.github/workflows/automerge.yml','utf8');
const script=yaml.match(/          script: \|\n([\s\S]*)/)![1].split('\n').map(s=>s.slice(12)).join('\n');
const ausfuehren=new Function('github','context','core','require','process',`return (async()=>{${script}})()`);
test('SIN-840: tatsächliches Automerge sperrt fehlende Belege, führt nur nach aktuellem Gate einen SHA-Merge aus',async()=>{
 for(const allowed of [false,true]){
  const calls:string[]=[];
  const pr={number:1,node_id:'node',state:'open',draft:false,title:'fix (SIN-840)',body:'Closes #1',labels:[{name:'risk:medium'}],head:{sha:'head',repo:{full_name:'fixture/repo'}},base:{sha:'basis',ref:'main',repo:{full_name:'fixture/repo'}}};
  const github={graphql:async(q:string)=>{assert.doesNotMatch(q,/enablePullRequestAutoMerge/);calls.push('disable');},paginate:async(fn:string)=>fn==='files'?[]:[{id:1,name:'build',app:{slug:'github-actions'},status:'completed',conclusion:'success'}],rest:{pulls:{get:async()=>({data:pr}),listFiles:'files',merge:async(a:{sha:string})=>{assert.equal(a.sha,'head');calls.push('merge');}},repos:{getBranch:async()=>({data:{protected:true,commit:{sha:'basis'}}}),getContent:async()=>({data:[]})},checks:{listForRef:'checks'},issues:{}}};
  const require=(name:string)=> name==='node:child_process'?{execFileSync:()=>{calls.push('gate');return JSON.stringify({allowed,head:'head',basis:'basis'});}}:{brauchtInhalt:()=>false,klassifiziere:()=>({gruende:[],high:false})};
  await ausfuehren(github,{repo:{owner:'fixture',repo:'repo'},sha:'basis',payload:{pull_request:pr}},{info:()=>{},warning:()=>{}},require,{execPath:'node',env:{}});
  assert.deepEqual(calls,allowed?['disable','gate','merge']:['disable','gate']);
 }
});
