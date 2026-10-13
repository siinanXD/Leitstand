# SIN-572: Der CEO steuert auch den Leitstand

- **Snapshot:** `waechter.yml` (stündlich) schreibt eine Zusammenfassungszeile `leitstand` in `loop_snapshot` (alte Zeile mit `issue is null` löschen, dann einfügen): `queue` `{todo, startable, in_progress}` (Linear, Projekt „Leitstand“, Label `claude`), `open_prs` (offene `claude/`-PRs, CI-Grün unbekannt = `false`, damit „Braucht dich“ nichts Falsches zeigt), `progress` `{done, total}` aus den Haken in `docs/FERTIG.md` (`fertig_v1`/`gesamt_v1` aus dem Issue sind die bestehende Spalte `progress`), `quotas` leer.
- **Neue Spalte `queue`:** Migration liegt als `docs/autonomy/loop_snapshot_queue.sql.vorlage`, nicht unter `supabase/migrations/` (wie bei SIN-542). Bis sie läuft, schlägt das Schreiben für `leitstand` mit einem Fehler im Log fehl; die anderen Projekte laufen weiter.
- **CEO:** entscheidet für alle `PROJEKTE` mit `repo`. Fehlt die Snapshot-Zeile: `warten`, „Keine Daten“. `startbar()` nimmt bei einer Zusammenfassungszeile `queue.startable`.
- **Auffüllen** nur bei `weiterbauen` mit `auffuellen > 0`: Leitstand → bis zu `auffuellen` Linear-Issues aus offenen Punkten in `docs/FERTIG.md` (Backlog, Label `claude`, Meilenstein „v1 Grundgerüst“, Titel-Abgleich gegen alle offenen Issues des Projekts, Groß-/Kleinschreibung egal; der Dispatcher rückt nach). Lern-App → `planner.yml` per `workflow_dispatch` (`dry_run=false`). Kein KI-Aufruf.
- **`docs/FERTIG.md`** gab es im Repo nicht; sie ist jetzt angelegt, ohne Punkte (nichts erfunden). Sinan trägt die offenen Punkte ein. Ohne Punkte zeigt der Leitstand keinen Fortschritt und der CEO legt nichts an.
- **Karte „Der Chef sagt“:** eine Zeile je Produkt, Projekte in Bauphase zuerst (`platzReihenfolge`).

## Aufgabe für Sinan (Label `sinan`)

Der Worker darf `.github/workflows/` nicht ändern:

1. `waechter.yml`: `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` aus den Secrets in den Schritt „Projekte prüfen“ geben.
2. `ceo.yml`: `LINEAR_API_KEY` ergänzen; `AGENT_WORKFLOW_TOKEN` braucht Schreibrecht auf Actions der Lern-App (für `planner.yml`).
3. Die Migration `queue` freigeben und verschieben.
