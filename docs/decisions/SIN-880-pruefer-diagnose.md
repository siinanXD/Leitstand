# SIN-880: Prüfer-Diagnose und Antwortbudget

Befund: main-Lauf https://github.com/siinanXD/Leitstand/actions/runs/39389773514 bricht für #308 mit Anthropic HTTP 400 ab. Der OpenAI-Fehlertext wurde verworfen; daraus lässt sich weder fehlendes Guthaben noch ein falscher API-Key beweisen. Der Rückfall startet bisher auch bei allgemeinen HTTP-429-Ratenlimits.

Entscheidung: API-Antworttext vor Log-Ausgabe redigieren und auf 300 Zeichen begrenzen; beim fehlgeschlagenen Rückfall beide Provider-Ursachen erhalten. HTTP-JSON, leeres/ungültiges Review-JSON und Tokenlimit-Abbruch getrennt melden. Keine Antwortinhalte im JSON-Parserfehler. Fail-closed und bestehende Gate-/Freigaberegeln bleiben erhalten.

Der OpenAI-Aufruf verwendet explizit reasoning_effort=low. Das gemeinsame Reasoning-/Ausgabebudget steigt von 1500 auf 6000 Tokens; dieselbe Konstante fließt in die bestehende Kosten-/Diffschätzung ein. Keine automatische Wiederholung und kein neuer Budgetdeckel. Es ist keine Garantie gegen alle langen Reviews und keine harte Abrechnungssperre.

Quellen, geprüft am 20.10.2026:
- https://developers.openai.com/api/docs/models/gpt-6-luna : low unterstützt, Standardpreise 0.10/0.50 USD je Million Tokens bis 272K Eingabe; darüber höhere Tarife. Vorhandene Repo-Preisvariablen werden nicht verändert.
- https://developers.openai.com/api/docs/guides/reasoning : Reasoning braucht Ausgabetokens; niedriger Aufwand reduziert normalerweise Tokenbedarf und Latenz.

Validierung: echte CLI gegen isolierte API-Fixtures für Erfolg, leere Antwort, ungültiges HTTP-/Review-JSON, Tokenlimit und beide Rückfallpfade. Fehler müssen im Ledger ankommen, dürfen keinen Erfolgs-Kommentar erzeugen und keine Fixture-Keys ausgeben. Datei-Abnahme zeigt nur Installation; echter API-Lauf auf #308 bleibt nach Aktivierung erforderlich. Keine behauptete Live-Reparatur aus Fixtures.

## Nacharbeit: alter PR-Snapshot nach main-Fortschritt

Der erste Live-Lauf auf dem Fix, https://github.com/siinanXD/Leitstand/actions/runs/39393800161, scheitert vor der API an der Zielvalidierung. Nachgewiesen: Workflow und geschütztes main stehen auf 51f9144, die PR-API nennt für #308 noch f8291dc als base.sha.

Runtime und Triple-Dot-Diff werden deshalb an den aktuellen geschützten main-SHA gebunden; der PR-Basis-Snapshot wird separat als pr_basis erfasst. Vor Veröffentlichung werden offener Zustand, beide Zielrepos, Zielbranch main, Head und PR-Basis-Snapshot sowie aktueller main-SHA und Schutzstatus erneut gelesen. Ein während des Laufs fortgeschrittenes main oder geänderter Head/Snapshot/Ziel bleiben gesperrt. Keine PR-Datei wird ausgeführt. Neuer Live-Lauf bleibt nach Owner-Aktivierung erforderlich; die API-Ursache ist weiter offen.

Regression: ausgeführter Zielvalidierungs-Code mit altem PR-Snapshot; ausgeführter Shell-Guard mit positivem Fall und Gegenproben für Head, Snapshot, beide Repos, Zielbranch, geschlossenen PR, main-Fortschritt und entfallenen Schutz.

## Belegte API-Ursachen und Claude-Rückfall

Der automatische Prüfer auf #319 erreicht die API und liefert mit #318 die vollständige Diagnose (Job 118533232301): OpenAI HTTP 429 / credit_balance_exhausted (keine API-Credits). Der Rückfall antwortet Anthropic HTTP 400: tool_choice vom Typ tool/any wird vom konfigurierten Modell nicht unterstützt. Kein Geld aufgeladen, keine Keys oder Modelle geändert.

Claude erhält deshalb das identische SCHEMA als output_config.format (type=json_schema), ohne tools/tool_choice. JSON kommt aus text-Blöcken und wird weiterhin lokal durch leseAntwort und bewerte geprüft; max_tokens/refusal/ungültiges oder leeres JSON bleiben Fehler. Quelle: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (20.10.2026). Die echte CLI-Fixture prüft den gesendeten Body und Erfolg, leere/ungültige Ausgabe, Abbruch und Ablehnung. Dies belegt API-Kompatibilität noch nicht live; nach Aktivierung neuen Lauf ausführen.
