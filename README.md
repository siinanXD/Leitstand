# Leitstand

Übersicht über alle Projekte, Worker, Tokens und Abläufe (Linear SIN-242). Eigenes Repo, getrennt von der Content-Agent-Lernapp.

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver auf Port 43124 |
| `npm run build` | Produktions-Build |
| `npm run typecheck` | TypeScript prüfen |
| `npm run lint` | ESLint |
| `npm test` | Unit-Tests (Kontrast der Design-Tokens) |
| `npm run test:a11y` | Playwright mit axe-core (nach `npm run build`) |
| `npm run stand` | Stand-Agent: schreibt `stand-bericht.json` (SIN-508) |

## Anmelden am iPhone (SIN-510)

Die App vom Home-Bildschirm hat einen eigenen Speicher; der Magic-Link öffnet Safari. Darum gibt es zusätzlich den 6-stelligen Code aus der Mail:

1. Safari → Teilen → Zum Home-Bildschirm.
2. App öffnen, E-Mail-Adresse eingeben, „Link senden“.
3. Code aus der Mail bei „Code aus der Mail“ eingeben, „Mit Code anmelden“.

Voraussetzung: Die Supabase-Mail-Vorlage „Magic Link“ (Authentication → Email Templates) enthält den Platzhalter für den Code (Token) neben dem Link, siehe `docs/decisions/SIN-510-code-anmeldung.md`. Die Sitzung bleibt per Refresh-Token bestehen.

## Pausen (SIN-581)

Trifft ein Dienst sein Limit (Claude, OpenAI, Vercel-Deploys, GitHub, Linear, …), steht eine Zeile in `kontingent_pausen` mit der Reset-Zeit. Quelle der Zeit: Meldung im Log (ohne Zeitzone gilt UTC), sonst Header `retry-after` / `x-ratelimit-reset`, sonst Standard je Dienst (Claude 5 h, Vercel 24 h, GitHub und Linear 1 h).

| Befehl | Zweck |
| --- | --- |
| `npx tsx scripts/kontingent/kontingent.ts melden --dienst claude --log lauf.log` | Limit im Log erkannt → Pause speichern |
| `npx tsx scripts/kontingent/kontingent.ts pruefen --dienst claude` | Exit 3, solange die Pause läuft |
| `npx tsx scripts/kontingent/kontingent.ts wecken` | Abgelaufene Pausen: `dispatch` anstoßen, `geweckt_at` setzen |

Trockenlauf: `DRY_RUN=1`, künstliche Pause mit `melden --dienst claude --minuten 2`. `dispatch` und der Wächter beachten die Pause; Begründung in `docs/decisions/SIN-581-kontingent-pausen.md`.

## Umgebungsvariablen

Nur Namen in `.env.example`. Werte kommen aus Infisical (Pfad `/leitstand`).

## Stand

Gerüst mit Design-Tokens aus Figma. Datenquelle: SIN-303 (Lern-App). Übersicht, Projekt-Detail und Handy-Ansicht: SIN-304.
