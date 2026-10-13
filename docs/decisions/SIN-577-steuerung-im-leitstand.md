# SIN-577: Steuerung liegt im Leitstand

Sinan, 13.10.2026: „Alles, was automatisch regelt, vorantreibt oder Neues plant, gehört in den Leitstand, nicht in die Content-Agent-App.“

## Entscheidung

- **Leitstand = Steuerzentrale für alle Produkte.** Rollen, `agents.json`, Schemas, Skills, Regeln, Auslöser, Kosten und Gedächtnis liegen nur hier. Ein Workflow je Rolle, das Produkt ist ein Parameter (`produkt: lernapp | leitstand | …`).
- **Produkt-Repo = nur Produkt.** Bleiben: `ci`, `production-deploy`, `migrate`, `claude.yml` (Worker-Empfang über GitHub-Issue), `repair`, `automerge`/`pr-gate`, Produkt-Pipelines (`content-grow`, `video`, `werbeclip`, `source-check`).
- **Auslöser:** Der Leitstand startet Worker in Produkt-Repos per GitHub-Issue oder `repository_dispatch` mit `AGENT_WORKFLOW_TOKEN`. Ereignisse landen in `loop_events`.
- **Wissen bleibt beim Produkt:** `docs/product-readiness.json` und `LEHREN.md` liegen je Repo. Die Skills der Rollen liegen im Leitstand und werden als Kopie mit Quellenhinweis nach `docs/skills/` des Produkts gespiegelt (der Hausmeister hält sie gleich).
- **Regel:** Neue Steuerlogik entsteht nur im Leitstand (siehe `AGENTS.md`). Der Anwalt/Prüfer markiert Produkt-PRs, die neue Steuer-Workflows bringen, mit `no-automerge`.

## Umzug in 4 Schritten (je ein PR-Paar: Leitstand hinzu, Lern-App weg)

1. Dispatcher + Nachrücken (`dispatch.yml`, `dispatch.mjs`, `einsortieren.mjs`, `limits.mjs`): Wächter übernimmt beide Repos, Lern-App-`dispatch.yml` wird Stummel (`repository_dispatch`).
2. Planer, Readiness, Trend-Radar, Digest/Status, `sinan.mjs`: werden CEO (SIN-572), Trend-Radar 2 (SIN-575), Stand, Gedächtnis.
3. Kosten, Limits, Verbrauch (SIN-555).
4. Lehren, Skills, Aufräumen, Revert-Guard: Hausmeister (SIN-551), Selbstlern-Schleife (SIN-576).

Nach jedem Schritt: Workflows der Lern-App zählen (Ziel unter 12), Liste vorher/nachher im PR, Lauf der verschobenen Rolle gegen die Lern-App belegen.

## Stand dieses PRs

Nur die Regel und diese Entscheidung. Die Schritte 1 bis 4 sind **nicht** umgesetzt: Sie ändern `.github/workflows/` (dem Worker verboten) und das Repo `Content-Agent-Lernapp` (hier nicht erreichbar). Jeder Schritt braucht ein eigenes Issue.
