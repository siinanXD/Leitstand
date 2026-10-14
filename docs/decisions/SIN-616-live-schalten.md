# SIN-616: Leitstand-Funktionen live schalten

- **PR #146:** Migrationen `loop_snapshot_queue`, `loop_snapshot_plan` und `ceo_entscheidungen` liegen unter `supabase/migrations/leitstand/`. Regel „Done heißt live“ in `AGENTS.md`. Workflows blieben unverändert, weil der Worker annahm, er dürfe `.github/workflows/` nicht schreiben.
- **Worker:** `claude.yml` lief schon mit `AGENT_WORKFLOW_TOKEN` (wie SIN-234 der Lern-App). Neu: Prompt erlaubt Workflow-Änderungen ausdrücklich, `LINEAR_API_KEY` für `sinan`-Issues. `automerge.yml` stuft zusätzlich Änderungen am Gate selbst als `risk:high` ein (SIN-252).
- **Vorlagen:** `migrationen`, `trend`, `visionaer`, `lernen` neu unter `.github/workflows/`. Die übrigen zehn `.yml.vorlage` liefen schon als Workflow (neuere Fassung) und sind gelöscht.
- **Secrets:** `waechter.yml` bekommt `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (schreibt die `loop_snapshot`-Zeile), `ceo.yml` und `claude.yml` `LINEAR_API_KEY`. Alle schon auf main in Gebrauch, keine neuen.
- **Nicht übernommen:** `docs/marketing/werbemittel_arten.sql.vorlage` bleibt Vorlage (Tabelle gehört der Lern-App, SIN-405).
- **Offen:** Migrationen einspielen (Datenbank-Schema = eigene Freigabe durch Sinan), auch `20261014100000_werkzeug_status`.
