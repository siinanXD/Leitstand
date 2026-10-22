# SIN-615: Vault-Struktur nach LLM-Wiki-Muster

- Logik rein in `src/lib/gedaechtnis/vault.ts` (getestet), Einlesen des geklonten Vaults und Push in `scripts/gedaechtnis/schreiben.ts`. Ideen von Karpathys „LLM Wiki“ (Regeldatei, `index.md`, `log.md`, Lint) und obsidian-mind (`beschreibung` je Notiz); kein Fork, kein Code übernommen.
- Jede Notiz trägt `typ`, `produkt`, `status`, `datum`, `quelle`, `beschreibung` (`kopf` in `gedaechtnis.ts`). Ausgenommen: `CLAUDE.md`, `index.md`, `log.md`.
- Jeder Lauf schreibt zusätzlich `CLAUDE.md` (Regeln), `Ansichten/*.base` (Offene Entscheidungen, Ideen nach Produkt, Lehren), `index.md` (je Seite eine Zeile aus `beschreibung`) und hängt an `log.md` eine Zeile an (gleiche Zeile nie doppelt, damit ein unveränderter Lauf nichts pusht).
- Der Eingang (SIN-612) liegt jetzt unter `Gespräche/`; Idee-Notizen tragen `typ: idee, status: neu`, Entscheidungs-Notizen `typ: entscheidung, status: gilt`. Alte Dateien aus `Eingang/` werden beim Push verschoben (ihr Kopf ist alt, der Wochen-Check meldet sie, bis das Issue sie neu schreibt).
- Wochen-Check sonntags (Berliner Zeit) oder mit `WOCHEN_CHECK=1`: fehlende Eigenschaften, kaputte Links, Notizen ohne eingehenden Link, Widerspruch, Ideen `neu` älter als 30 Tage. Ergebnis als Abschnitt „Wochen-Check“ im Tagesbericht und als Zahl in `log.md`.
- shortcut: Widerspruch heißt nur „Ersetzt: [[X]]“ bei einer geltenden Entscheidung, während X selbst `gilt`; inhaltliche Widersprüche erkennt erst ein KI-Lauf.
- `Fehler/<Tag>.md`: rote `loop_events` der letzten 14 Tage nach Grund gebündelt; derselbe Grund 3× wird ein Eintrag in `Lehren/` (`src/lib/gedaechtnis/lernen.ts`). `Lehren/` füllt außerdem jede Zeile mit „→“ aus `LEHREN.md` beider Repos.
- Worker-Prompt (`claude.yml`) liest vor dem Start `index.md` und die passenden `Lehren/` des Vaults (Zugriff über `gh api`, Lesetoken des Workers).
- Noch offen (eigenes Issue): `Ideen/` aus dem Planer füllen.
