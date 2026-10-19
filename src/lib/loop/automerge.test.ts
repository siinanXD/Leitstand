import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const yaml = readFileSync('.github/workflows/automerge.yml', 'utf8');
// Der Loader wird ersetzt; Risiko/Fristen selbst werden zusätzlich in risiko.test.ts geprüft.
const script = yaml.match(/          script: \|\n([\s\S]*)/)![1].split('\n').map(s => s.slice(12)).join('\n')
  .replace('await import("./scripts/loop/risiko.mjs")', 'require("./scripts/loop/risiko.mjs")');
const ausfuehren = new Function('github', 'context', 'core', 'require', 'process', 'setTimeout', `return (async()=>{${script}})()`);

async function pruefe({ belegt = true, delay = 0, geaendert = false, draft = false, stopp = false, high = false } = {}) {
  const calls: string[] = [];
  let gelesen = 0;
  const pr = {
    number: 1, node_id: 'node', state: 'open', draft, title: 'fix (SIN-840)', body: 'Closes #1',
    labels: [{ name: high ? 'risk:high' : 'risk:medium' }, ...(stopp ? [{ name: 'needs-human' }] : [])],
    head: { sha: 'head', repo: { full_name: 'fixture/repo' } },
    base: { sha: 'basis', ref: 'main', repo: { full_name: 'fixture/repo' } },
  };
  const github = {
    graphql: async (q: string) => { assert.doesNotMatch(q, /enablePullRequestAutoMerge/); calls.push('disable'); },
    paginate: async (fn: string) => fn === 'files' ? [] : [{ id: 1, name: 'build', app: { slug: 'github-actions' }, status: 'completed', conclusion: 'success' }],
    rest: {
      pulls: {
        get: async () => { const data = structuredClone(pr); if (geaendert && gelesen++) data.head.sha = 'neu'; return { data }; },
        listFiles: 'files',
        merge: async (a: { sha: string }) => { assert.equal(a.sha, 'head'); calls.push('merge'); },
      },
      repos: { getBranch: async () => ({ data: { protected: true, commit: { sha: 'basis' } } }), getContent: async () => ({ data: [] }) },
      checks: { listForRef: 'checks' }, issues: { listComments: async () => ({data: []}), createComment: async () => ({}) },
      git: { getCommit: async () => ({ data: { committer: { date: '2026-01-01T00:00:00Z' } } }) },
    },
  };
  const require = (name: string) => name === 'node:child_process'
    ? { execFileSync: () => { calls.push('gate'); return JSON.stringify({ allowed: belegt, head: 'head', basis: 'basis' }); } }
    : { brauchtInhalt: () => false, stufe: () => ({ gruende: [], stufe: high ? 'high' : 'medium' }), wartezeitMs: () => delay };
  await ausfuehren(github, { repo: { owner: 'fixture', repo: 'repo' }, sha: 'basis', payload: { pull_request: pr } },
    { info: () => {}, warning: () => {} }, require, { execPath: 'node', env: {} }, (f: () => void) => { calls.push('wait'); f(); });
  return calls;
}

test('SIN-840: ohne Kriterienbelege kein Merge, mit aktuellem Gate nur SHA-Merge', async () => {
  assert.deepEqual(await pruefe({ belegt: false }), ['disable', 'gate']);
  assert.deepEqual(await pruefe(), ['disable', 'gate', 'merge']);
});

test('SIN-812/SIN-840: Einspruchsfrist bleibt, Belege danach prüfen; geänderter Head sperrt', async () => {
  assert.deepEqual(await pruefe({ delay: 1000 }), ['disable', 'wait', 'gate', 'merge']);
  assert.deepEqual(await pruefe({ delay: 1000, belegt: false }), ['disable', 'wait', 'gate']);
  assert.deepEqual(await pruefe({ delay: 1000, geaendert: true }), ['disable', 'wait']);
});

test('Draft, needs-human und fehlende High-Freigabe stoppen vor Wartezeit und Belegschritt', async () => {
  for (const option of [{ draft: true }, { stopp: true }, { high: true }]) assert.deepEqual(await pruefe({ ...option, delay: 1000 }), ['disable']);
});

test('Workflow hat genau eine Konkurrenzgruppe je PR, keine globale Dispatch-Sperre während Frist', () => {
  assert.equal((yaml.match(/^concurrency:/gm) || []).length, 1);
  assert.match(yaml, /group: automerge-/);
});
