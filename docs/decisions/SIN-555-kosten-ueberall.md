# SIN-555: Kosten überall (Leitstand-Seite)

Dieser PR baut nur, was in **diesem** Repo liegt. Langfuse-Pflicht, Ledger-Füllung und `limits.mjs` gehören in die Lern-App (`siinanXD/Content-Agent-Lernapp`: `src/lib/anthropic/client.ts`, Richter, `werbeclip.mjs`, `scripts/autonomy/`); dort gibt es dafür ein eigenes Issue.

## Was der Leitstand liest

- `loop_snapshot.guthaben` (Liste oder Objekt, auch als JSON-Text): je Dienst `dienst`, `wert` (übrig), `gesamt` (Einzahlung/Limit), `einheit` (Standard „€“), `quelle` (`api` | `gerechnet` | `schaetzung`), `aktualisiert`, optional `link` (nur http/https, für „Aufladen“). Einträge ohne gültige Zahlen oder ohne bekannte `quelle` fallen weg. Stehen mehrere Zeilen im Snapshot, gilt je Dienst die zuletzt aktualisierte.
- Wochendeckel: `KOSTEN_WOCHE_EUR` (Standard 60), Summe der letzten 7 Berliner Kalendertage aus denselben Quellen wie SIN-527 (Ledger gewinnt gegen Langfuse).
- Freie Kontingente: unverändert `loop_snapshot.quotas`; Schätzungen (Claude) stehen nicht unter „Freie Kontingente“.

## Warnregeln

Guthaben unter 20 % übrig oder Kontingent über 80 % benutzt ergibt eine Karte unter „Das musst du tun“ ganz oben, mit „Aufladen →“ (Link des Dienstes). Der Leitstand zahlt nie selbst.

## Bewusst ausgelassen

- „312 / 312 Aufrufe verbucht“ (Langfuse-Abdeckung): braucht eine Zahl aus der Lern-App, die es noch nicht gibt. Keine erfundene Anzeige.
- Figma K6 (`68:135`) wurde ohne `FIGMA_ACCESS_TOKEN` nicht gelesen: Figma nicht verfügbar. Die Seite nutzt die vorhandenen Bausteine der Übersicht; Feinschliff nach K6 folgt.

## Aufgabe für Sinan (Label `sinan`)

`KOSTEN_WOCHE_EUR` in Vercel setzen, falls nicht 60 €.
