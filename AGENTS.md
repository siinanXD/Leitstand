# AGENTS.md (Leitstand)

Regeln für alle Agenten in diesem Repo. Sie ersetzen Rückfragen an Sinan. Dieses Repo übernimmt die Regeln der Lern-App, bis der Projekt-Starter (SIN-202) sie automatisch liefert.

## Zuerst lesen

1. Das zugewiesene Linear-Issue (SIN-304, SIN-305 unter SIN-242)
2. `siinanXD/Content-Agent-Lernapp`: `AGENTS.md`, `docs/design/regeln-2026.md`, `docs/design/tokens.json`
3. Figma-Datei `7Ti9iVUjUjw3rh9WYhSu9K` ist die einzige Quelle für Farben, Abstände, Komponenten. Maßgeblich ist die **Variante 2026**: Frame `10:3` „B1 Leitstand · Variante 2026 (Bento, präzise)“ (Kopfzeile, „Heute in einem Satz“ mit Belegen, Bento mit Pipeline-Schiene, In Arbeit, Zahlen, Braucht dich, Kontingente, Aktivität 24 h). Alle Zahlen und Texte in diesem Frame sind Beispiele und werden nie übernommen. Werte per `get_design_context` lesen, nicht schätzen.

## Grundsatz

- Der Leitstand zeigt nur echte Daten aus Supabase (`loop_events`, `loop_snapshot`, SIN-303). Keine erfundenen Zahlen, keine Platzhalter-Statistiken.
- Claude-Kontingente sind Schätzungen und werden so gekennzeichnet.
- Aktionen (Freigeben, Planer jetzt, Notbremse) laufen nur serverseitig mit eigenem Token und werden protokolliert.
- Login nur für Sinan (Magic-Link, RLS).

## Technik

- Next.js 16 auf Vercel, PWA. **Dies ist nicht das Next.js aus dem Trainingswissen:** vor dem Code `node_modules/next/dist/docs/` lesen.
- Daten: Supabase EU (gleiches Projekt wie die Lern-App oder eigenes, Entscheidung in `docs/decisions/`).
- Ablauf-Ansicht: React Flow (xyflow, MIT), erst in SIN-305.

## Design

- Dunkler Leitstand-Look: 2 px Rundung, 1-px-Linien, keine Schatten, kein Leuchten, keine Verläufe, keine Glas-Effekte.
- Farben nur als Token (`var(--color-*)`), nie als Hex im Code. Status-Farben nur für Zustände.
- Schrift: Geist, Geist Mono für Kennungen und Zahlen. Keine weitere.
- Barrierefreiheit: WCAG 2.2 AA, Kontrast ≥ 4,5:1, Tastatur, Ziele ≥ 44 px, `prefers-reduced-motion` beachten.

## Verboten

- Zugangsdaten ins Repo (öffentlich werden kann). Nur `.env.example` mit Namen.
- Barrierefreiheits-Tests abschalten, um etwas durchzubringen.
- Personendaten in Prompts.

## Pull Requests

- Ein PR pro Linear-Issue. Titel als Conventional Commit mit Linear-ID, z. B. `feat(uebersicht): Projekt-Karten (SIN-304)`.
- Commit-Nachrichten enthalten `Part of SIN-xxx`.
- Vor dem Push: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`.
- Höchstens 3 Reparaturrunden pro PR, dann stoppen und Blocker melden.
- Nie selbst mergen.
