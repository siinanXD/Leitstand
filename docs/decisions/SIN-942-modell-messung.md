# SIN-942: Modell-Messung je Rolle mit Routing-Tabelle

Status: angenommen (2026-10-23)

## Entscheidung

- `docs/autonomy/modelle.json` ist die einzige Quelle für Modellnamen je Rolle (Modell, Kontextfenster, Werkzeuge, zugehörige Schritte in `loop_events`). Workflows lesen sie per `jq`, Skripte über `src/lib/kennzahlen/modelle.ts`. Ein Test sperrt feste Modellnamen in Workflows und diesen Skripten.
- `scripts/kennzahlen/modelle.ts` misst je Rolle und Modell: Durchstich-Quote, Prüfer-Runden je PR, Kosten je Issue, Dauer je Issue. Ergebnis in `loop_snapshot.modelle` und als Langfuse-Score (feste id je Woche, Rolle, Modell, Größe). Der Wächter ruft es stündlich auf.
- Keine automatische Umschaltung. Die Tabelle ändert nur ein Mensch oder der Planer mit Beleg aus der Messung.

## Grenzen

- `loop_events` hat keine Modell-Spalte. Ohne sie gilt das Modell aus der Tabelle; erst ein Ereignis-Feld `modell` trennt Modelle derselben Rolle sauber.
- Die Durchstich-Quote nutzt den Tageswert (48 h) aus `durchstich.ts`, nicht sieben Tage.
- Der Vergleichslauf (zwei Modelle, fünf Issues, Tagesdeckel) und die erste Wochenmessung brauchen die aktivierte Messung und die Migration `20261023100000_loop_snapshot_modelle.sql`.
