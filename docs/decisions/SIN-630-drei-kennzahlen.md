# SIN-630: Drei Kennzahlen, die zählen

Stand 2026-10-15. Risiko: medium.

## Entscheidung

Ganz oben auf der Startseite stehen drei Kacheln mit Wort, Zahl und 8-Wochen-Verlauf (`src/app/kennzahlen-kachel.tsx`). Die Zahlen kommen als Zähler/Nenner je Woche (Montag, UTC) aus `kennzahlen_woche` (Migration `20261015100000`). Ohne Zeile oder mit Nenner 0 steht „noch keine Zahl“, nie 0 und nie geschätzt. Logik rein in `src/lib/kennzahlen/kennzahlen.ts`.

| Kennzahl | Zähler / Nenner | Quelle |
| --- | --- | --- |
| Verkaufsfertig | veröffentlichte Einheiten, die Richter v2 im ersten Durchlauf bestanden haben, mit Kurs-passender Quelle und in keiner roten Probe / alle veröffentlichten Einheiten des Kurses. Ziel MAF Metall: 890 Einheiten, 90 % | Lern-App (Richter v2, Quellen je Kurs), rote Proben aus `loop_events` (Schritt `abnahme`) |
| Kosten je bestandener Einheit | Euro der Woche / bestandene Einheiten der Woche | Ledger `pipeline_run_costs` (Lern-App) plus Langfuse (wie `src/lib/kosten/kosten.ts`) |
| Fehlgeschlagene Änderungen | gemergte PRs, die binnen 48 h zurückgenommen, repariert (Reparatur-PR oder `repair:*`) oder durch eine rote Probe aufgefallen sind / alle gemergten PRs der Woche | GitHub (PRs von `claude/`), `loop_events` |

`verkaufsfertig()` und `fehlgeschlagen()` rechnen Rohzeilen in Zähler/Nenner um. Wer die Zeilen schreibt (Messlauf mit `service_role`), nutzt sie.

## Gleiche Zahlen im Gedächtnis

`zeileText()` / `zahlText()` liefern die Schreibweise für `00 Wo stehen wir.md` und die Content-Landkarte-Routine. Eine Zeile pro Kennzahl.

## Offen

- Der Messlauf, der `kennzahlen_woche` füllt, braucht Lesezugriff auf die Lern-App-Datenbank (Richter-Ergebnisse, `pipeline_run_costs`) und Langfuse. Bis dahin zeigt die Kachel „noch keine Zahl“. Aufgabe für Sinan, siehe PR.
- Anbindung von `00 Wo stehen wir.md` an `zeileText()` folgt, sobald die Zeilen gefüllt sind.
