// SIN-856: echter Dispatcher-Einstieg gegen geschlossene Netz-Fixtures, keine Live-Starts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fall = process.env.PARALLEL_PROBE_CHILD;
if (fall) {
  // Ein prüfbarer Haken je Issue, sonst sperrt der Kriterien-Check (SIN-929) das Issue vor der Auswahl.
  const scope = p => `- [ ] Test: ${p} baut\n<!-- worker-pfade: ${JSON.stringify([p])} -->`;
  const issues = [1, 2, 3].map(n => ({ id: `SIN-${n}`, identifier: `SIN-${n}`, title: `Aufgabe ${n}`, description: scope(`src/app/${n}`), priority: n, url: `https://linear.app/test/issue/SIN-${n}`, createdAt: '2026-01-01T00:00:00Z', startedAt: '2020-01-01T00:00:00Z', labels: { nodes: [{ name: 'claude' }] }, state: { type: 'unstarted' }, team: { id: 'team' }, inverseRelations: { nodes: [] } }));
  if (fall === 'gemeinsam') issues[1].description = issues[0].description;
  if (fall === 'claim-unklar') issues[0].description = null;
  const claimed = fall.startsWith('claim') ? [1] : fall === 'zwei-claims' ? [1, 2] : [];
  const rows = claimed.map(n => ({ issue: `SIN-${n}`, claim_revision: 1, claim_provider: 'claude', claim_id: `claim-${n}`, claim_at: '2020-01-01T00:00:00Z', reparaturen: 0 }));
  const starts = [], reservations = [], seen = [];
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(String(input)), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : {};
    if (u.hostname === 'api.linear.app') {
      if (body.query.includes('issues(first: 25')) return json({ data: { issues: { nodes: body.variables.p === 'Leitstand' ? issues : [], pageInfo: { hasNextPage: false, endCursor: null } } } });
      if (body.query.includes('team(id:')) return json({ data: { team: { states: { nodes: [{ id: 'started', name: 'In Progress' }] }, labels: { nodes: [{ id: 'l-unklar', name: 'kriterien-unklar' }] } } } });
      if (/issueUpdate|commentCreate/.test(body.query)) return json({ data: { issueUpdate: { success: true }, commentCreate: { success: true } } });
    }
    if (u.hostname === 'fixture.invalid') {
      if (u.pathname.endsWith('/leitstand_aufgaben')) {
        if (method === 'GET') {
          const id = u.searchParams.get('issue');
          if (id?.startsWith('in.')) { seen.push(id); return json(rows); }
          return json(rows.filter(r => id === `eq.${r.issue}`));
        }
        if (method === 'PATCH') { const issue = u.searchParams.get('issue').slice(3); reservations.push(issue); return json([{ issue, ...body }]); }
      }
      if (method === 'GET') return json([]);
      if (u.pathname.endsWith('/loop_events') && method === 'POST') return json([]);
    }
    if (u.hostname === 'api.github.com') {
      if (!u.pathname.startsWith('/repos/siinanXD/Leitstand/')) return json({}, 404);
      if (u.pathname.endsWith('/pulls')) return json(u.searchParams.get('state') === 'open' && fall.startsWith('pr-') ? [{ number: 99, title: 'Unzugeordneter PR', head: { ref: 'topic/other' }, labels: [] }] : []);
      if (u.pathname.endsWith('/pulls/99/files')) {
        if (fall === 'pr-unlesbar') return json({}, 503);
        if (fall === 'pr-page2' && u.searchParams.get('page') === '1') return json(Array.from({ length: 100 }, (_, n) => ({ filename: `docs/other${n}.md` })));
        if (fall === 'pr-page2' && u.searchParams.get('page') === '2') return json([{ filename: 'src/app/1/page.tsx' }]);
        return json([{ filename: 'src/app/1/page.tsx' }]);
      }
      if (u.pathname.endsWith('/issues') && method === 'GET') return json([]);
      if (u.pathname.endsWith('/issues') && method === 'POST') {
        const id = body.title.match(/SIN-\d+/)[0];
        assert.ok(reservations.includes(id), 'Start nur nach atomarer Reservierung'); starts.push(id);
        return json({ number: 100 + starts.length, html_url: 'https://github.com/siinanXD/Leitstand/issues/100' });
      }
      if (/\/issues\/\d+\/labels$/.test(u.pathname) && method === 'POST') return json([]);
    }
    throw new Error(`Fixture erlaubt diese Anfrage nicht: ${method} ${u.hostname}${u.pathname}`);
  };
  process.on('exit', () => console.log(`PROBE:${JSON.stringify({ starts, reservations, seen })}`));
} else {
  const cases = { getrennt: ['SIN-1', 'SIN-2'], gemeinsam: ['SIN-1', 'SIN-3'], claim: ['SIN-2'], 'zwei-claims': [], 'claim-unklar': [], 'pr-dateien': ['SIN-2', 'SIN-3'], 'pr-page2': ['SIN-2', 'SIN-3'], 'pr-unlesbar': [] };
  const results = [];
  for (const [name, expected] of Object.entries(cases)) {
    const r = spawnSync(process.execPath, ['--import', fileURLToPath(import.meta.url), '--import', 'tsx', 'scripts/loop/loop.ts', 'dispatch'], { encoding: 'utf8', timeout: 20_000, env: { PATH: process.env.PATH, PARALLEL_PROBE_CHILD: name, GITHUB_REPOSITORY: 'siinanXD/Leitstand', GH_TOKEN: 'fixture', LINEAR_API_KEY: 'fixture', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture', LOOP_MAX_PARALLEL: '1', LEITSTAND_MAX_PARALLEL: '2', DRY_RUN: '0' } });
    assert.equal(r.status, 0, `${name}: ${r.stdout}\n${r.stderr}`);
    const actual = JSON.parse(r.stdout.match(/PROBE:(.*)/)[1]);
    assert.deepEqual(actual.starts, expected, name);
    if (name.startsWith('claim') || name === 'zwei-claims') assert.ok(actual.seen.some(s => s.includes('SIN-1') && s.includes('SIN-2') && s.includes('SIN-3')));
    results.push({ name, starts: actual.starts, ok: true });
  }
  const result = { art: 'dispatcher-fixture-kein-live-start', ok: true, faelle: results };
  if (process.env.PROBE_BERICHT) writeFileSync(process.env.PROBE_BERICHT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
