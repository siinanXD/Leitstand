// Closed network fixture for the real dispatch entry point; never forwards requests.
import assert from 'node:assert/strict';
const fall = process.env.CODEX_FALL;
const mutations = [], delegates = [], comments = [];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const issue = (n, rolle = 'review') => ({ id: `SIN-${n}`, identifier: `SIN-${n}`, title: `Auftrag ${n}`, description: `- [ ] Test: Bericht vorhanden\n<!-- worker-pfade: ["docs/reviews/${n}.md"] -->${rolle ? `\n<!-- codex-rolle: ${rolle} -->` : ''}`, priority: n, url: `https://linear.app/test/issue/SIN-${n}`, createdAt: '2026-01-01', startedAt: null, delegate: null, labels: { nodes: [{ name: 'codex' }] }, state: { type: 'unstarted' }, team: { id: 'team' }, inverseRelations: { nodes: [] } });
const issues = [issue(1, fall === 'ohne-rolle' ? null : 'review'), issue(2, 'content')];
if (fall === 'idempotent') issues[0].description += '\n\n## Codex-Rollenauftrag\nAlter Versuch';
const anderer = { ...issue(9), delegate: { name: 'Codex' }, state: { type: 'started' }, startedAt: '2020-01-01' };
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(String(input)), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : {};
  if (u.hostname === 'api.linear.app') {
    const q = body.query;
    if (q.includes('issues(first: 25')) {
      if (fall === 'unbekannt' && body.variables.p === 'Content-Agent-Lernapp') return json({ errors: [{ message: 'unavailable' }] }, 503);
      const nodes = body.variables.p === 'Leitstand' ? issues : body.variables.p === 'Content-Agent-Lernapp' && fall === 'belegt' ? [anderer] : [];
      return json({ data: { issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } });
    }
    if (q.includes('users(first:')) return json({ data: { users: { nodes: fall === 'app-fehlt' ? [] : [{ id: 'codex', name: 'Codex' }] } } });
    if (q.includes('team(id:')) return json({ data: { team: { labels: { nodes: [{ id: 'claude', name: 'claude' }, { id: 'codex-label', name: 'codex' }] }, states: { nodes: [{ id: 'todo', name: 'Todo' }, { id: 'started', name: 'In Progress' }] } } } });
    if (q.includes('issueUpdate')) {
      mutations.push(body.variables);
      const i = issues.find(i => i.id === body.variables.id);
      if (body.variables.beschreibung) i.description = body.variables.beschreibung;
      if (body.variables.d === 'codex') {
        assert.match(i.description, /Codex-Rollenauftrag/);
        assert.equal(i.description.split('## Codex-Rollenauftrag').length, 2);
        assert.match(i.description, /Produktcode.*nur lesen/);
        delegates.push(i.id);
        if (fall === 'start-unklar') throw new Error('Start acknowledgement lost');
        i.delegate = { name: 'Codex' };
      }
      return json({ data: { issueUpdate: { success: true } } });
    }
    if (q.includes('commentCreate')) { comments.push(body.variables); return json({ data: { commentCreate: { success: true } } }); }
  }
  if (u.hostname === 'fixture.invalid') {
    if (u.pathname.endsWith('/kontingent_pausen') && fall === 'claude-pause') return json([{ dienst: 'claude', bis: '2099-01-01T00:00:00Z', grund: 'fixture', repo: null, erstellt_at: '2026-01-01', geweckt_at: null }]);
    // Only the read-only occupancy succeeds; actual Claude reservations fail closed.
    if (u.pathname.endsWith('/leitstand_aufgaben')) return u.searchParams.get('issue')?.startsWith('in.') ? json(fall === 'claim' ? [{ issue: 'SIN-1', claim_revision: 1, claim_provider: 'claude', claim_id: 'external', claim_at: '2099-01-01', reparaturen: 0 }] : []) : json({}, 503);
    return json([]);
  }
  if (u.hostname === 'api.github.com') {
    if (u.pathname.startsWith('/repos/siinanXD/Content-Agent-Lernapp/') && (u.pathname.endsWith('/contents/.github/workflows/claude.yml') || u.pathname.endsWith('/actions/secrets/CLAUDE_CODE_OAUTH_TOKEN'))) return json({});
    if (u.pathname.includes('matching-refs')) return json([]);
    if (u.pathname.endsWith('/statuses')) return json([]);
    if (u.pathname.endsWith('/pulls')) return json(fall === 'pr' && u.searchParams.get('state') === 'open' ? [{ number: 99, title: 'Review (SIN-1)', head: { ref: 'claude/sin-1', sha: 'a'.repeat(40) }, labels: [], created_at: '2099-01-01' }] : []);
    if (u.pathname.endsWith('/pulls/99/files')) return json([{ filename: 'docs/reviews/1.md' }]);
    if (u.pathname.endsWith('/issues')) return json(fall === 'spiegel' ? [{ number: 99, state: 'open', body: '<!-- linear:SIN-1 -->' }] : []);
    if (u.pathname.endsWith('/actions/workflows/claude.yml/runs')) return json({ workflow_runs: [] });
    if (!u.pathname.startsWith('/repos/siinanXD/Leitstand/')) return json({}, 404);
  }
  throw new Error(`Unexpected fixture request: ${method} ${u.hostname}${u.pathname}`);
};
process.on('exit', () => console.log(`CODEX:${JSON.stringify({ delegates, mutations, comments })}`));
