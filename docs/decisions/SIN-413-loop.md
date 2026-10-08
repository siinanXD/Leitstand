# SIN-413 — Leitstand an den Loop anschließen

**Links:** Linear [SIN-413](https://linear.app/sinan-kahraman/issue/SIN-413), [SIN-401](https://linear.app/sinan-kahraman/issue/SIN-401) (Secrets, Plan „Dispatcher, Worker, pr-gate ins Repo“), Lern-App `scripts/autonomy/dispatch.mjs` und `linear.mjs` (Vorbild), [GitHub: workflow_run](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#workflow_run).

## Entscheidung

- Schlanker Loop statt Kopie aller 40 Skripte der Lern-App: Linear → GitHub-Issue mit Label `claude` → vorhandenes `claude.yml`. Das nutzt den Worker, der schon läuft, und braucht keine neuen Secrets (SIN-401: `LINEAR_API_KEY`, `AGENT_WORKFLOW_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`).
- Höchstens 1 Issue gleichzeitig (Variable `LOOP_MAX_PARALLEL`), weil sich Leitstand und Lern-App das Claude-Kontingent teilen.
- Kein eigenes Risiko-Gate: `automerge.yml` lässt Workflow-Änderungen schon für Sinan liegen. Datenbank-Änderungen liegen im Repo der Lern-App und laufen dort durch dessen Gate.
- Labels und Kommentare setzt immer `AGENT_WORKFLOW_TOKEN`, nie `github.token` (dessen Ereignisse starten keine Folge-Workflows).

## Annahmen

- Die Linear-Status heißen „Todo“, „In Progress“, „Done“ (so im Team SIN, Verlauf von SIN-401).
- `workflow_run.pull_requests` ist für PRs aus demselben Repo gefüllt. Für Forks greift die Reparatur nicht (gibt es hier nicht).
- Der Takt läuft über den GitHub-Zeitplan (alle 2 Stunden). Ein cron-job.org-Job wie bei der Lern-App ist optional, falls GitHub den Zeitplan verzögert.
