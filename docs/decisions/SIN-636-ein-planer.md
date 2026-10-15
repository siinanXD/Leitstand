# SIN-636: Ein Planer statt CEO + Vorarbeiter + Planer

- **Warum:** Drei Ebenen planten gleichzeitig (Befund aus `loop_events`, 7 Tage bis 14.10.): CEO 53 Läufe ohne ein angelegtes Issue, Vorarbeiter 29 Läufe ohne sichtbaren Plan, Planer der Lern-App 42 Läufe mit Dubletten (8× Screenreader). Niemand war eindeutig verantwortlich.
- **Planer (eine Rolle):** legt Issues an, plant Reihenfolge und Spur. Im Leitstand ist das `scripts/vorarbeiter/vorarbeiter.ts` (Pfad bleibt, sonst wandern Tests, Importe und die Entscheidung SIN-553; Kopfkommentar nennt den Planer). Workflow `.github/workflows/planer.yml`: täglich 04:00 UTC (06:00 Berlin im Sommer), nach `loop-merge` und `abnahme`, bei geänderter `docs/FERTIG.md`, von Hand. Der Schlangen-Auslöser (unter 3 startbar) wirkt bei jedem Lauf: `luecke()` in `src/lib/ceo/ceo.ts` bestimmt, wie viele fehlen.
- **Dubletten:** Titel werden gegen alle Issues des Linear-Projekts verglichen, auch erledigte (vorher nur offene: ein gebauter, noch offener Punkt der Fertig-Liste kam zurück). Lern-App: der Planer stößt deren `planner.yml` an, die eigene Prüfung (SIN-613) dort liegt im anderen Repo.
- **CEO (schlank):** `ceo.yml` läuft nur noch täglich 04:10 UTC (nach dem Planer) oder von Hand, nicht mehr nach jedem Merge und bei Änderung der Fertig-Liste. Je Produkt genau eine Entscheidung `weiterbauen | warten | fertig` mit Grund. Ein roter Live-Check ist `weiterbauen` mit `dringend` (vorher `reparieren`; die Datenbank erlaubt den alten Wert weiter, der Leitstand liest ihn als `weiterbauen`). Der CEO legt kein Issue mehr an.
- **Gedächtnis:** Die Entscheidung des Tages steht je Produkt im Abschnitt „CEO“ von `Tage/<datum>.md` (aus `ceo_entscheidungen`, höchstens 4 Zeilen).
- **Register:** `docs/autonomy/agents.json` (Rolle `planer` ersetzt `vorarbeiter`, Skill, Schema und Fixture umbenannt, `docs/ABLAUF.md` neu), Leitstand-Seite „Mein Team“: „Vorarbeiter (zusammengelegt)“ steht bei den ruhenden Rollen. Ausgabe weiter als Structured JSON mit Schema (Regel vom 13.10.).
- **Abnahme-Proben:** `leitstand-planer-lauf`, `leitstand-ceo-taeglich`, `leitstand-keine-dublette` in `docs/abnahme.yml`.

## Workflow-Läufe für Planung, vorher und nachher

| | vorher (7 Tage bis 14.10., gemessen) | nachher (Soll) |
| -- | -- | -- |
| CEO | 53 | 7 (einmal täglich) |
| Vorarbeiter / Planer Leitstand | 29 | ereignisgesteuert, Obergrenze 1 gleichzeitig (`concurrency`) |
| Planer Lern-App | 42 | wird vom Planer angestoßen, nur bei Schlange unter 3 |

Der Wert „nachher“ ist ein Soll, keine Messung. Messen: eine Woche nach Einspielen, `loop_events` mit `step in (ceo, planer)` zählen und hier eintragen.

## Aufgaben für Sinan

- Lern-App: eigene Planer-Rolle dort auf dasselbe Modell umstellen (anderes Repo, hier nicht änderbar); `docs/product-readiness.json`-Lesen dort ist Teil davon.
- Nicht in diesem PR: Planer liest Abnahme-Proben, Fehlergründe und den Gesprächs-Eingang (heute nur Fertig-Liste und Schlange; die Proben lösen den Lauf aus, legen aber noch kein Issue an).
