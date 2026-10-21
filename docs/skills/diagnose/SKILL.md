# Skill: Diagnose (SIN-907)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: einen roten Lauf oder ein Issue mit 2 Worker-Läufen ohne PR selbst untersuchen und Ursache plus Vorschlag benennen. Du urteilst, du änderst nichts.

## Eingabe

`diagnose-ziel.json` im Arbeitsverzeichnis: `schluessel` (`SIN-xxx` oder `workflow:<name>`), `art` (`issue` | `workflow`), `beleg` (Links/Zeilen, die den Auslöser belegen).

## Erlaubte Werkzeuge (nur lesend)

- `gh run view <id> --json ...`, `gh run view <id> --log-failed`, `gh run list`; Annotationen stehen in `gh run view <id> --json jobs` und im Log
- Supabase: `diagnose-daten.json` (festgelegte Tabellen `loop_events`, `loop_snapshot`, `leitstand_aufgaben`, vom Skript lesend vorgelegt). Du hast keinen Supabase-Schlüssel.
- Repo lesen (Read, Grep, Glob), Issue und PR per `gh issue view` / `gh pr view`

Keine Schreibrechte außer `diagnose-ergebnis.json`, kein Push. Den Linear-Kommentar schreibt das Skript aus deinem JSON, nicht du.

## Vorgehen

1. Auslöser lesen, dann die Kette rückwärts verfolgen: Lauf-Log, Annotationen, `loop_events` des Issues, offene/gemergte PRs, Zustand von `docs/abnahme.yml`-Proben.
2. Ursache als eine überprüfbare Aussage formulieren („Insert in `loop_events` schlägt mit 401 fehl, Key fehlt“), nicht als Vermutung. Ist die Ursache nicht belegbar, sage das und nenne, was fehlt.
3. `art` wählen:
   - `erledigt`: alle Haken der „Fertig, wenn“-Liste sind mit aktuellem Beleg erfüllt (mindestens 2 Belege). Vorschlag: Done mit Belegen.
   - `code`: ein Code-Worker kann es beheben.
   - `lauf`: Neustart, Zeitplan oder Konfiguration eines Workflows, kein Code (SIN-887).
   - `sinan`: Secret, Migration einspielen oder Entscheidung nötig.
4. `vorschlag`: ein konkreter nächster Schritt, mit Pfad oder Link.

## Ausgabe

Schreibe `diagnose-ergebnis.json` nach `docs/diagnose/schema.json`: `rolle` = `diagnose`, `ziel` = `schluessel`, `zeitpunkt` (UTC, ISO), `ursache`, `beleg[]` (Links, Zeilen, Abfragen mit Ergebnis), `art`, `vorschlag`. Sonst keine Datei ändern.

Grenzen: höchstens 1 Diagnose je Issue/Workflow in 6 h (setzt das Skript durch). Du setzt nie einen Linear-Status; der Dispatcher entscheidet anhand von `art`.
