# SIN-639: Prüfer mit zweitem Modell

**Entscheidung:** Jeder Agenten-PR (`claude/*`) wird von einem OpenAI-Modell geprüft (`.github/workflows/pruefer.yml`, `scripts/pruefer/pruefer.ts`, Logik in `src/lib/pruefer/`). Gleiche Modellfamilie übersieht dieselben Fehler.

- **Prüft:** „Fertig, wenn“-Punkte belegt, Abnahme-Probe vorhanden, Ponytail und Schema, Sicherheit. Ausgabe als Structured JSON (`bestanden`, `funde[]` mit Datei, Zeile, Schwere).
- **Fehlende Probe** prüft der Code selbst (nicht nur das Modell): PR mit Änderungen unter `src/`, `scripts/`, `supabase/`, `.github/` ohne `docs/abnahme.yml` ist „nicht bestanden“.
- **Schwere „hoch“** setzt das Label `risk:high`. `automerge.yml` senkt es nie (SIN-623), das Gate selbst bleibt unverändert.
- **Modell und Preise** stehen nicht im Code, sondern in Repo-Variablen `PRUEFER_MODELL`, `PRUEFER_PREIS_EIN`, `PRUEFER_PREIS_AUS` (USD je 1 Mio. Tokens). Sie sind aus der aktuellen OpenAI-Doku zu setzen; ohne sie bricht der Lauf ab. Grund: Die Doku war beim Bauen nicht erreichbar, geraten wird nicht.
- **Kostendeckel 0,10 $ je PR:** Der Diff wird so gekürzt, dass Eingabe plus volle Ausgabe (`max_completion_tokens` 1500) darunter bleiben. Gekürzt ist ein Fund „mittel“.
- **Ledger:** je Review eine Zeile in `loop_events` (Schritt `pruefer`, `payload.kosten_eur_usd` in USD trotz Namen, `pr`).
- **Datenschutz:** Der Diff geht an OpenAI. Er enthält keine Personendaten (Repo ist ohne), Secrets stehen nie im Repo.
- **Offen:** Anzeige der Prüfer-Kosten im Kosten-Block der Übersicht (`src/lib/kosten`) ist ein eigener Schritt.
