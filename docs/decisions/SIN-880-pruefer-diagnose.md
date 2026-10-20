# SIN-880: Prüfer-Diagnose und Antwortbudget

Befund: main-Lauf https://github.com/siinanXD/Leitstand/actions/runs/39389773514 bricht für #308 mit Anthropic HTTP 400 ab. Der OpenAI-Fehlertext wurde verworfen; daraus lässt sich weder fehlendes Guthaben noch ein falscher API-Key beweisen. Der Rückfall startet bisher auch bei allgemeinen HTTP-429-Ratenlimits.

Entscheidung: API-Antworttext vor Log-Ausgabe redigieren und auf 300 Zeichen begrenzen; beim fehlgeschlagenen Rückfall beide Provider-Ursachen erhalten. HTTP-JSON, leeres/ungültiges Review-JSON und Tokenlimit-Abbruch getrennt melden. Keine Antwortinhalte im JSON-Parserfehler. Fail-closed und bestehende Gate-/Freigaberegeln bleiben erhalten.

Der OpenAI-Aufruf verwendet explizit reasoning_effort=low. Das gemeinsame Reasoning-/Ausgabebudget steigt von 1500 auf 6000 Tokens; dieselbe Konstante fließt in die bestehende Kosten-/Diffschätzung ein. Keine automatische Wiederholung und kein neuer Budgetdeckel. Es ist keine Garantie gegen alle langen Reviews und keine harte Abrechnungssperre.

Quellen, geprüft am 20.10.2026:
- https://developers.openai.com/api/docs/models/gpt-6-luna : low unterstützt, Standardpreise 0.10/0.50 USD je Million Tokens bis 272K Eingabe; darüber höhere Tarife. Vorhandene Repo-Preisvariablen werden nicht verändert.
- https://developers.openai.com/api/docs/guides/reasoning : Reasoning braucht Ausgabetokens; niedriger Aufwand reduziert normalerweise Tokenbedarf und Latenz.

Validierung: echte CLI gegen isolierte API-Fixtures für Erfolg, leere Antwort, ungültiges HTTP-/Review-JSON, Tokenlimit und beide Rückfallpfade. Fehler müssen im Ledger ankommen, dürfen keinen Erfolgs-Kommentar erzeugen und keine Fixture-Keys ausgeben. Datei-Abnahme zeigt nur Installation; echter API-Lauf auf #308 bleibt nach Aktivierung erforderlich. Keine behauptete Live-Reparatur aus Fixtures.
