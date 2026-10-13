# SIN-561: Designer-Rolle und Nachweis je Frontend-PR

## Entscheidung

- Die Rolle steht in `docs/skills/designer/SKILL.md`.
- Der Nachweis wird als `loop_events`-Zeile mit `payload.art = "nachweis"` abgelegt. **Abweichung vom Issue:** `event_type` gibt es nicht als Spalte (siehe SIN-556, SIN-542); gefiltert wird über `issue` und `payload.art`.
- Reine Logik in `src/lib/nachweis.ts` (Frontend-Pfade, Route aus Datei, Clip-Regel, Lesen des Payloads, nur `https`).
- `/aufgabe/<ID>` zeigt „Was sich geändert hat“: Vorher/Nachher je Route (Handy zuerst, Routen per Wischen), Clip mit Abspielknopf, Dateiliste. Ohne Nachweis erscheint der Abschnitt nicht.

## Bewusst ausgelassen

- `nachweis.yml` und die Playwright-Aufnahme (Screenshots, Clip, Upload nach Storage `nachweise/<ID>/`, Schreiben des Ereignisses): Der Worker darf `.github/workflows/` nicht ändern, und `visual.yml`, `sichtpruefung.yml` sowie `video/` liegen in diesem Repo nicht. Das ist Sinans Schritt; der Vertrag oben ist die Schnittstelle.
- Löschen von Nachweisen älter als 60 Tage (Hausmeister, SIN-551).
- Miniatur des Nachher-Bilds in der Startseiten-Karte „Zuletzt geschafft“.
- „Fertig, wenn“ mit Fixture-PRs ist daher noch nicht prüfbar; Playwright/axe wurde hier nicht ausgeführt.
