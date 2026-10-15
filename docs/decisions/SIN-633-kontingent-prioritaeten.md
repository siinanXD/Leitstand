# SIN-633: Kontingent-Prioritäten und Ausweichmodell

## Entscheidung

Logik rein in `src/lib/kontingent/prioritaet.ts` (mit Tests), Netz in `scripts/kontingent/pausen.ts` (`ladeClaudeRest`), Einbau in `waehle` und `dispatch`.

- **Reihenfolge:** 1 rote Probe/Bug (Label `bug`, `probe-rot`), 2 Produkt Lern-App (`lernapp`), 3 Produkt Leitstand (Standard), 4 Loop/Infra (`loop`, `infra`), 5 Idee (`idee`). `waehle` sortiert erst nach Stufe, dann nach Priorität und Alter.
- **Rest:** geschätzt aus der Claude-Quote in `loop_snapshot` (Schätzung, so gekennzeichnet). Ohne Quote oder bei Lesefehler bremst nichts.
- **Puffer:** unter 15 % Rest startet nichts (Platz für Sinans Sitzungen). Unter 40 % laufen nur Stufe 1–2.
- **Schätzung je Größe:** Label `klein` 2, `mittel` (Standard) 5, `gross` 10 Prozentpunkte. Es startet nur, was über dem Puffer noch hineinpasst.
- **Anzeige:** Details-Seite, oben im „Heute in einem Satz“: „Kontingent knapp … es laufen nur noch Stufe 1–2“.

## Ausweichmodell

Noch nicht gebaut. Vorschlag: einfache Aufgaben (Doku, kleine Textänderungen) auf OpenAI umleiten, dessen Key für den Richter schon in Infisical liegt. Offen sind die aktuelle Doku des Modells und ein Worker, der ohne Claude Code arbeitet. Das ist ein eigenes Issue (Sinan entscheidet nach Blick in die Doku).

## Ausgelassen

- Schätzung aus echten `loop_events`: dort steht kein Verbrauch je Issue, deshalb feste Werte (`shortcut`, ausbauen, sobald der Verbrauch protokolliert wird).
- Dispatcher der Lern-App: anderes Repo, braucht denselben Aufruf dort.
