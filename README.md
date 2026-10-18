# Leitstand

A mobile-first control room that shows what a fleet of AI agents is building, what it costs, and what needs a human, for one person running several software products.

<!-- Hero screenshot: pending, see "Ausgelassen" in the pull request. Playwright capture belongs to the designer role (SIN-561). -->

## Why

Autonomous coding agents produce pull requests around the clock, but nobody can tell at a glance what is running, stuck, or waiting for approval. Leitstand reads the events the agents write to Supabase (`loop_events`, `loop_snapshot`) and shows only real data: no invented numbers, and Claude quota figures are labelled as estimates. Actions such as approve, run the planner now, or emergency stop run server-side with their own token and are logged. Sign-in is restricted to the owner (magic link, row-level security).

## Architecture

![Architecture: Linear to dispatcher to Claude worker to build gate to auto-merge, all writing to Supabase, read by the Next.js dashboard](docs/architecture.svg)

The self-building loop is described in [`docs/decisions/SIN-413-loop.md`](docs/decisions/SIN-413-loop.md); the agent roles in [`docs/ABLAUF.md`](docs/ABLAUF.md).

Dispatcher und Planer lesen offene Linear-Projekt-Issues in Seiten zu 25 mit Cursor-Fortsetzung (SIN-825), damit verschachtelte Abfragen unter dem Komplexitätslimit bleiben.

## Stack

Next.js 16 · React 19 · TypeScript · Supabase (EU) · React Flow · GitHub Actions · Vercel · PWA with web push

## Quick start

```bash
npm ci
cp .env.example .env.local   # fill in the Supabase values, names only in the repo
npm run dev                  # http://localhost:43124
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:a11y` (Playwright with axe-core, after `npm run build`).

## What I learned

1. A dashboard is only trustworthy if every number has a source row; refusing placeholder statistics shaped the whole data model.
2. Unattended agents need hard gates: a required build check, a bounded number of repair rounds (3), and a human label for risky changes.
3. Quota-limited services need pauses with a reset time (`kontingent_pausen`) instead of blind retries.

## Further docs

- Signing in on iPhone (home-screen app, 6-digit code from the mail): [`docs/decisions/SIN-510-code-anmeldung.md`](docs/decisions/SIN-510-code-anmeldung.md)
- Quota pauses: [`docs/decisions/SIN-581-kontingent-pausen.md`](docs/decisions/SIN-581-kontingent-pausen.md)
- Rules for agents working in this repo: [`AGENTS.md`](AGENTS.md)

## License

[MIT](LICENSE)
