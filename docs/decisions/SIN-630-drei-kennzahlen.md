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

## Messlauf (SIN-969)

`scripts/kennzahlen/woche.ts` läuft als Schritt in `waechter.yml` und schreibt die laufende Woche per Upsert nach `kennzahlen_woche` (Rechnung: `wochenZeilen()`). Ohne Nenner keine Zeile. Kosten kommen aus `pipeline_run_costs`, gemergte PRs aus GitHub (zurückgenommen = späterer PR „Revert …“ mit `#<Nr>`, repariert = „fix …“ mit `#<Nr>`, je binnen 48 h). Einheiten liest das Skript aus der Sicht `kennzahlen_einheiten` der Lern-App-Datenbank mit den Spalten `bestanden_am`, `veroeffentlicht`, `erster_durchlauf_bestanden`, `quelle_kurs_passend`, `in_roter_probe`; fehlt die Sicht, gibt es nur die Zeile „Fehlgeschlagene Änderungen“ und eine Warnung. Ein Label `repair:*` am PR zählt ebenfalls als repariert. Grenze: rote Proben werden den PRs noch nicht zugeordnet.

## Offen

- Die Sicht `kennzahlen_einheiten` (aus `question_evaluations` und `judge_runs`) fehlt noch. Sie muss in der Datenbank liegen, deren `SUPABASE_URL` der Messlauf nutzt (Lesen und Schreiben dort; Annahme: gleiche Datenbank wie `kennzahlen_woche`). Langfuse-Kosten fehlen. Bis dahin zeigt die Kachel teils „noch keine Zahl“. Aufgabe für Sinan, siehe PR.
- `00 Wo stehen wir.md` ist angebunden: `scripts/gedaechtnis/schreiben.ts` liest `kennzahlen_woche` (Produkt `maf`) und schreibt je Kennzahl eine `zeileText()`-Zeile. Die 25-Zeilen-Grenze bleibt, es passen entsprechend weniger Produkte. Die Probe `gedaechtnis-kennzahlen` (`docs/abnahme/SIN-630.yml`) wird grün, sobald der Messlauf Zeilen gefüllt hat.
