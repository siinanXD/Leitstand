# SIN-812: Loop schneller (Einspruchsfrist, risk:low, Dispatch nach Merge)

Entscheidung Sinan, gleiche Lockerung wie in der Lern-App.

## Regel

- `risk:low` (nur Doku und Tests): Auto-Merge sofort nach grünem `build`.
- Nie `risk:low`: Änderungen an `.github/workflows/`, an `permissions:`, an Secrets-Nutzung, an `scripts/autonomy/risk.mjs` und am Gate. Sie bleiben `risk:medium` mit 30 Min Frist; erweiterte Rechte bleiben `risk:high`.
- `risk:medium`: Einspruchsfrist 30 Minuten (vorher keine Frist im Leitstand, 2 h in der Lern-App) ab dem letzten Commit. Danach prüft `automerge.yml` Draft, `no-automerge` und Head neu.
- `risk:high`: unverändert, wartet auf `freigegeben`.
- Logik rein in `scripts/loop/risiko.mjs` (`stufe`, `wartezeitMs`), Tests in `src/lib/loop/risiko.test.ts`.
- Neuer Push bricht den wartenden Lauf ab (`concurrency` je PR) und startet die Frist neu.

## Dispatch nach Merge

- Leitstand-PRs: `dispatch.yml` startet auf jeden Push nach `main`, auch wenn der Agent-Token mergt. Der Schritt in `loop-merge.yml` bleibt, weil er zusätzlich Linear auf Done setzt.
- Produkt-Repos (SJCODE-website, stromlauf-ai): `dispatch.yml` lauscht auf `repository_dispatch` mit Typ `produkt-merge`.

## Offen für Sinan

- In beiden Produkt-Repos je ein post-merge-Workflow (`pull_request: closed`, gemergt), der mit `AGENT_WORKFLOW_TOKEN` `POST /repos/siinanXD/Leitstand/dispatches` mit `{"event_type":"produkt-merge"}` sendet.
- Die pr-gate-Vorlage (`automerge.yml` samt `risiko.mjs`) dort identisch einsetzen, keine eigenen Kopien.
- Diese Änderung betrifft das Gate und ist `risk:high`.
