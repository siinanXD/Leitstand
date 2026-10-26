# Leitstand

A mobile-first control room that shows what a fleet of AI agents is building, what it costs, and what needs a human, for one person running several software products.

<!-- Hero screenshot: pending (docs/assets/start.png, SIN-752). The start page needs a signed-in session; the Playwright capture belongs to the designer role (SIN-561). -->

## Why

Autonomous coding agents produce pull requests around the clock, but nobody can tell at a glance what is running, stuck, or waiting for approval. Leitstand reads the events the agents write to Supabase (`loop_events`, `loop_snapshot`) and shows only real data: no invented numbers, and Claude quota figures are labelled as estimates. It also runs the loop itself: a dispatcher picks Linear issues, a Claude worker opens the pull request, a build gate and a second-model reviewer decide whether it merges, and hourly acceptance probes (`docs/abnahme.yml`) check that merged work actually runs.

## Architecture

![Architecture: Linear to dispatcher to Claude worker to build gate to auto-merge, all writing to Supabase, read by the Next.js dashboard](docs/architecture.svg)

The self-building loop is described in [`docs/decisions/SIN-413-loop.md`](docs/decisions/SIN-413-loop.md), the agent roles in [`docs/ABLAUF.md`](docs/ABLAUF.md). Actions such as approve, run the planner now, or emergency stop run server-side with their own token and are logged. Sign-in is restricted to the owner (magic link or 6-digit code, row-level security), so the deployed app has no public demo.

## Stack

Next.js 16 · React 19 · TypeScript · Supabase (EU) · React Flow · GitHub Actions · Vercel · PWA with web push

## Quick start

```bash
npm ci
cp .env.example .env.local   # fill in the Supabase values, names only in the repo
npm run dev                  # http://localhost:43124
```

| Command | Purpose |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm test` | Checks before every push |
| `npm run build`, `npm start` | Production build and server on port 43124 |
| `npm run test:a11y` | Playwright with axe-core, after `npm run build` |
| `npm run lighthouse` | Lighthouse CI against `lighthouserc.json` |
| `npm run stand` | Compares code, docs and environment names (`scripts/stand/pruefen.ts`) |
| `npm run knip` | Unused files and exports |
| `npm run hausmeister` | Collects cleanup findings into `docs/autonomy/HAUSMEISTER.md`; deletes nothing |

## What I learned

1. A dashboard is only trustworthy if every number has a source row; refusing placeholder statistics shaped the whole data model.
2. Unattended agents need hard gates: a required build check, a bounded number of repair rounds (3), and a human label for risky changes.
3. "Merged" is not "done": an issue only closes when its acceptance probe is green, because code without a running workflow, migration or secret does nothing.

## Further docs

- Operations notes (auto-merge probe, reviewer, fallback, parallel workers, evidence binding), in German: [`docs/BETRIEB.md`](docs/BETRIEB.md)
- Role/tool evidence and open acceptance checks: [`docs/autonomy/ROLLEN-ABNAHME.md`](docs/autonomy/ROLLEN-ABNAHME.md); a dated assessment, not live telemetry.
- Signing in on iPhone (home-screen app, 6-digit code from the mail): [`docs/decisions/SIN-510-code-anmeldung.md`](docs/decisions/SIN-510-code-anmeldung.md)
- Quota pauses with a reset time instead of blind retries: [`docs/decisions/SIN-581-kontingent-pausen.md`](docs/decisions/SIN-581-kontingent-pausen.md)
- Context7 documentation access: [`docs/decisions/SIN-537-leitstand-context7.md`](docs/decisions/SIN-537-leitstand-context7.md)
- Research CLI: `DRY_RUN=1 npx tsx scripts/autonomy/research.ts SIN-826 "agent tools"` checks startup without network or file writes.
- Suggested GitHub description and topics for the loop repos: [`docs/github-profil.md`](docs/github-profil.md)
- Rules for agents working in this repo: [`AGENTS.md`](AGENTS.md)

## License

[MIT](LICENSE)
