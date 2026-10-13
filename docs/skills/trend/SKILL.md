# Skill: Trend (SIN-575)

Aufgabe: erkennen, was gerade durch die Decke geht (GitHub, Hugging Face, Releases), und je Produkt prüfen, ob es nützt. Messung ohne Modell, Bewertung mit Haiku (Deckel 0,50 € je Lauf). Logik in `src/lib/trend/trend.ts`, Netz in `scripts/trend/trend.ts`, Entscheidung in `docs/decisions/SIN-575-trend-radar-2.md`.

Ausgabe als JSON nach `docs/schemas/trend.json` (`funde`). Stand und Funde liegen in `docs/markt/trends.json`. Regel wie AGENTS.md: MIT/Apache, aktiv, mehr als 500 Sterne, sonst höchstens `beobachten`. `jetzt` nur bei Sicherheits- oder Kostenrelevanz und nur als Vorschlag an Sinan, nie selbst `dringend`.
