# SIN-626: Abnahme-Proben

Datum: 14.10.2026. Anlass: Am 14.10. standen Funktionen auf Done, die nicht liefen (leerer Snapshot, falsche Quote, leeres Gedächtnis, Workflows nur als Vorlage).

## Entscheidung

- `docs/abnahme.yml`: flache Liste von Proben (Art `http`, `db`, `datei`, `github`). Die Datenbankprobe ist ein reines GET auf die REST-Schnittstelle, sie kann nichts ändern. Eine Probe, die sich nicht ausführen lässt (Secret fehlt, Netz weg), ist rot.
- `abnahme.yml` (Workflow, stündlich Minute 23): schreibt je Probe eine Zeile `loop_events` (Schritt `abnahme`, `status` ok oder failed, `issue` = Titel der Probe). Keine neue Tabelle, keine Migration.
- Leitstand-Seite `/abnahme` („Läuft es wirklich?“) zeigt das jüngste Ergebnis je Probe, rot zuerst. Route ohne Design-Issue (SIN-574), Eintrag in `docs/design/OFFEN-FIGMA.md`.
- Alarm: `scripts/push/ausloeser.ts` meldet jede Probe, die länger als 2 Stunden rot ist (Art Alarm, Ruhezeit-Regeln wie sonst). Ein Alarm je Rot-Phase, bei mehr als 24 h Rot einer je Tag (Ereignisfenster der Seite).
- Regel „kein Done ohne grüne Probe“ steht in `AGENTS.md`.

## Offen (bewusst nicht in diesem PR)

- Automatischer Haken in der Fertig-Liste durch den CEO (grün setzen, bei rot entfernen): braucht die Zuordnung Punkt zu Probe, eigenes Issue.
- Dieselbe Regel in `AGENTS.md` der Lern-App und des Gedächtnis-Repos sowie deren eigene `docs/abnahme.yml`: andere Repos, macht Sinan oder ein Worker dort. Die Lern-App- und Gedächtnis-Proben dieses Repos prüfen von hier aus über Supabase und GitHub.
- Variable `LEITSTAND_URL` (Repo-Variable oder Secret) für die Probe `leitstand-health`; ohne sie ist die Probe rot.
