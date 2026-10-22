# SIN-907: Diagnose-Agent

Entscheidung (Sinan, 21.10.2026): Urteilsarbeit über Agenten, festen Code nur für Geld, Daten, Sicherheit. Der Diagnose-Agent untersucht rote Läufe.

- **Rolle als Skill:** `docs/skills/diagnose/SKILL.md` (Prompt), Ausgabe nach `docs/diagnose/schema.json` (nicht in `docs/schemas`: dort verlangen Tests den Kopf der 13 registrierten Rollen; Aufnahme in `agents.json` bleibt offen) (`ursache`, `beleg[]`, `art: code|lauf|sinan|erledigt`, `vorschlag`). Kein Code-Modul für das Urteil.
- **Fester Rand:** `src/lib/diagnose/diagnose.ts` (rein, getestet) wählt die Auslöser (rote Workflows; Issue mit 2 beendeten Worker-Läufen ohne PR), setzt die Sperre (1 Diagnose je Issue/Workflow in 6 h) und prüft die Ausgabe. `art: erledigt` braucht mindestens 2 Belege.
- **Nur lesend:** Der Agent hat Read/Grep/Glob, `gh run view|list`, `gh issue|pr view` und darf nur `diagnose-ergebnis.json` schreiben. Er bekommt keinen Supabase-Schlüssel; `scripts/diagnose/diagnose.ts` legt `loop_events`, `loop_snapshot` und `leitstand_aufgaben` als Datei vor. Linear-Kommentar und `loop_event` (Schritt `diagnose`) schreibt das Skript.
- **Kein Statuswechsel durch den Agenten.** Der Dispatcher entscheidet anhand von `art` (Tabelle `folge` in `diagnose.ts`). Diese Verdrahtung im Dispatcher ist nicht Teil dieses PR.
- **Kosten:** Claude-Abo (`CLAUDE_CODE_OAUTH_TOKEN`), keine API.
- **Grenze der Tests:** Die Fixtures prüfen den Vertrag (Schema, Auslöser, Sperre, Kommentar), nicht das Urteil des Modells. Ob die Diagnosen taugen, zeigt erst der erste echte Lauf.
- **Workflow-Auslöser:** `workflow_run` (failure) für abnahme, build, dispatch, loop-merge, repair, belege, migrationen; alle 2 Stunden für Issues; von Hand mit `dry_run`.

- **Betriebskorrektur (22.10.2026):** `Write(diagnose-ergebnis.json)` ist kein dokumentierter Dateiwerkzeug-Eintrag der Action und führte im echten Lauf zu Berechtigungsablehnungen ohne Ergebnisdatei. Der Matcher wird durch den dokumentierten Toolnamen `Write` ersetzt; Prompt, read-only GitHub-Rechte und nachgelagerte Schema-Prüfung begrenzen die dauerhafte Wirkung. Aktivierung erst nach unabhängiger Freigabe des Draft-PRs.
