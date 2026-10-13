# SIN-556: Aufgabe antippen zeigt den Ablauf

Seite `/aufgabe/<ISSUE-ID>` (Figma A5 `68:2`). Rein aus Supabase, kein GitHub-Aufruf zur Laufzeit.

## Datenquelle

- Gelesen werden alle `loop_events` mit `issue = <ID>` (seitenweise, RLS wie überall). Eine Meldung ist eine Zeile, deren `payload` (Objekt oder JSON-Text) ein `rolle` trägt. Gelesen werden `rolle`, `zeitpunkt` (sonst `created_at`), `status`, `zusammenfassung`, `naechster_schritt`, `kosten_eur`, `quellen`, `werkzeuge`; das ganze JSON steht aufklappbar unter „Zuletzt gemeldet“.
- **Abweichung vom Issue:** `loop_events` hat keine Spalte `event_type` (siehe SIN-542). Gefiltert wird deshalb über `issue` und ein lesbares `payload.rolle`, nicht über `event_type = 'rolle_ergebnis'`. Zeilen ohne `payload` (normale Loop-Ereignisse) fallen weg. Kommt die Spalte später, ist das ein einzeiliger Zusatzfilter in `ladeAufgabe`.
- Je Rolle zählt die jüngste Meldung. Reihenfolge: gelaufene Rollen nach erster Meldung, danach die übrigen der festen Reihe (CEO, Vorarbeiter, Forscher, Bauer, Prüfer, Anwalt) grau mit „keine Meldung“. Unbekannte Rollen aus den Daten erscheinen ebenfalls.
- Status → Zustand: Fehlerwörter ergeben „kaputt“, `ok/done/fertig/…` „fertig“, `start/running/…` „läuft“, alles andere „wartet“. Nie wird Unbekanntes als „fertig“ gezeigt.

## Links

Linear aus der Kennung; PR aus `pr_url` im JSON oder `loop_snapshot.pr` plus Repo; Langfuse-Trace nur aus `langfuse_trace`/`trace_url` im JSON; Laufprotokoll aus `laufprotokoll` oder als Link auf `docs/autonomy/laeufe/<ID>.json` im Repo (nur Link, kein Abruf). Nur `http(s)`-Adressen aus dem JSON werden verlinkt, sonst „nicht verfügbar“.

## Einstieg

Start („Was gerade passiert“): Titel eines Eintrags mit Kennung `SIN-…` ist ein Link. Projektseite („Deine Aufgaben“): Knopf „Ablauf ansehen“.

## Bewusst ausgelassen

- Der Schreibpfad (`scripts/autonomy/leitstand.mjs`, `execution_file`-Werkzeuge, `agents.json`-Zuordnung) liegt nicht in diesem Repo; dieser PR liest nur. Solange kein Workflow `payload` schreibt, zeigt die Seite „keine Meldung“.
- Figma A5 ohne `FIGMA_ACCESS_TOKEN` nicht gelesen: Figma nicht verfügbar. Die Seite nutzt vorhandene Bausteine; Feinschliff nach A5 folgt.
- „Echter Lauf (SIN-456) über die Startseite erreichbar“ lässt sich erst prüfen, wenn echte `payload`-Zeilen in Supabase stehen.
