# SIN-616: Leitstand-Funktionen live schalten

- **Entscheidung:** Migrationen `loop_snapshot_queue`, `loop_snapshot_plan` und `ceo_entscheidungen` liegen jetzt unter `supabase/migrations/leitstand/` (waren `.sql.vorlage`). Regel „Done heißt live“ steht in `AGENTS.md`.
- **Nicht übernommen:** `docs/marketing/werbemittel_arten.sql.vorlage` bleibt Vorlage: die Tabelle `werbemittel` gehört der Lern-App (SIN-405), der Name der Prüfregel ist unverifiziert.
- **Grenze:** Der Lauf nutzt das App-Token, das `.github/workflows/` nicht schreiben darf. Die `.yml.vorlage`-Dateien (siehe `find docs -name '*.yml.vorlage'`) konnten deshalb nicht übernommen werden.

## Aufgabe für Sinan (Label `sinan`)

1. Einmalig Sinans Freigabe (`risk:high`): Der Worker-Lauf in `claude.yml` schreibt Workflow-Dateien mit `AGENT_WORKFLOW_TOKEN` (Workflows RW); `pr-gate` stuft nur Rechte-Erweiterungen als `risk:high` ein, alles andere `medium` (wie SIN-234/SIN-252 in der Lern-App). Dann `LINEAR_API_KEY` in `claude.yml` ergänzen.
2. Danach jede `docs/**/*.yml.vorlage` nach `.github/workflows/` übernehmen (oder begründet streichen) und die Vorlage löschen; Vorlagen mit gleichnamigem Workflow zuerst gegeneinander prüfen.
3. Migrationen aus diesem PR im Leitstand freigeben und einspielen (Datenbank-Schema = Freigabe durch Sinan), ebenso `20261014100000_werkzeug_status`.
4. `waechter.yml` um `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`, `ceo.yml` um `LINEAR_API_KEY` ergänzen; fehlende Secrets bis SIN-611 gebündelt.
5. `docs/FERTIG.md` mit Punkten füllen (pflegt Sinan), sonst bleibt der Fortschritt leer.
6. Die Regel „Done heißt live“ in `AGENTS.md` der Lern-App ergänzen (anderes Repo, hier nicht möglich).
