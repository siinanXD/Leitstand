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

## Umgebungsvariablen

Nur Namen in `.env.example`. Werte kommen aus Infisical (Pfad `/leitstand`).

## Stand

Gerüst mit Design-Tokens aus Figma. Datenquelle: SIN-303 (Lern-App). Übersicht, Projekt-Detail und Handy-Ansicht: SIN-304.
