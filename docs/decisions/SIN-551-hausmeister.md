# SIN-551: Hausmeister-Agent

- Logik rein in `src/lib/hausmeister/hausmeister.ts` (getestet), Netz und Dateien in `scripts/hausmeister/hausmeister.ts`. Ausgabe: `docs/autonomy/HAUSMEISTER.md`.
- Prüfungen: knip (ungenutzte Dateien, Exporte, Abhängigkeiten), jscpd (Dubletten, per `npx`, keine Abhängigkeit), Workflows ohne Lauf in 14 Tagen, Skripte ohne Aufrufer, `docs/decisions/` ohne `SIN-`-Nummer, LEHREN.md über 150 Zeilen.
- knip ist als Dev-Abhängigkeit eingetragen, `npm run knip` endet nie mit Fehlercode (Warnung, nicht blockierend). Konfiguration: `knip.json`.
- Das Skript löscht nichts. Löschungen kommen als ein PR pro Woche; Unsicheres bleibt als Liste in `HAUSMEISTER.md`.
- Workflow: `docs/autonomy/hausmeister.yml.vorlage` (montags 07:00). Der Worker darf `.github/workflows/` nicht ändern.

## Lizenznachweis

| Quelle | Lizenz | Verwendung |
| --- | --- | --- |
| [webpro-nl/knip](https://github.com/webpro-nl/knip) | ISC (laut Issue; MIT-gleichwertig, freizügig) | Dev-Abhängigkeit |
| [kucherenko/jscpd](https://github.com/kucherenko/jscpd) | MIT (laut Issue) | nur per `npx` im Workflow |

Lizenztexte wurden beim Bauen nicht abgerufen (kein Netz außer npm).

## Aufgabe für Sinan (Label `sinan`)

1. `hausmeister.yml` aus der Vorlage anlegen; `npm run knip` als Schritt in `build.yml` ergänzen. Den PR-Text im Schritt „PR öffnen“ prüfen.
2. Lern-App (`Content-Agent-Lernapp`): `aufraeumen.yml` ebenso umbauen und Workflow-Zahl von 27 auf unter 20 senken. Das ist ein anderes Repo und hier nicht erledigt.

## Ausgelassen

- Kachel „Hausmeister“ auf der Übersicht: es gibt keine echten Daten dafür (kein `loop_events`-Eintrag), erfundene Zahlen sind verboten. Folgt, sobald der Workflow Ereignisse schreibt.
- Nicht geprüft: Lauf von knip und jscpd (Ausführung war in dieser Umgebung nicht freigegeben), Hausmeister-PR 1, Lern-App-Workflows.
