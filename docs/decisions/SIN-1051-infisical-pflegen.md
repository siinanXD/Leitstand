# SIN-1051: Infisical pflegt sich selbst

Status: angenommen (2026-10-23)

## Entscheidung

- Soll-Liste: `docs/autonomy/produkte.json`, je Produkt `infisicalOrdner` (heißt dort weiter so, nicht `infisical_pfad`) und `secrets: [{name, environment, zweck, wo_holen}]`. Nur Namen und Anleitung, nie Werte. Die Lern-App liegt in `/content-agent-lernapp` (wie im Smoke-Test), nicht mehr `/lernapp`.
- Leitstand: jeder Name aus `.env.example` und `secrets.*` der Workflows (ausgenommen `GITHUB_TOKEN`) steht in der Liste; ein Test sperrt Lücken. Lern-App und Stromlauf AI: Ihre `.env.example` und Workflows liegen in anderen Repos und sind im CI-Lauf dieses Repos nicht lesbar. Deshalb steht ein Namens-Schnappschuss in `docs/autonomy/env-namen.json` (am 23.10.2026 aus den Klonen von Content-Agent-Lernapp `origin/main` und stromlauf-ai `origin/master` erzeugt: Namen aus `.env.example` und `secrets.*` der Workflows, ohne `GITHUB_TOKEN`). Der Test prüft, dass jeder geheime Name daraus (Schlüssel, Token, Zugangs-URLs) im Register steht; reine Einstellungen wie `CHAT_MODEL` gehören nicht nach Infisical. Grenze: Der Schnappschuss veraltet; neu erzeugen, wenn dort Namen dazukommen (Ausbau: Abruf über die GitHub-API im geplanten Lauf).
- Abgleich (rein, `src/lib/infisical/abgleich.ts`): `fehlender_ordner`, `fehlende_variable`, `leerer_wert`, `unbekannt_in_infisical` (nur gemeldet).
- Pflege (`scripts/infisical/pflegen.ts`, Workflow `infisical-pflegen.yml`, täglich, nach Änderung des Registers, Trockenlauf bei Pull Requests): legt nur an, per POST; Variablen mit leerem Wert. Es gibt keine Aktion zum Ändern oder Löschen (Test).
- Erinnerung: je `leerer_wert` eine `sinan`-Aufgabe in Linear („Braucht dich“) mit Link auf den Ordner und `wo_holen`; sie wird geschlossen, sobald der Wert nicht mehr leer ist. Schreibrecht fehlt: genau eine `sinan`-Aufgabe.
- API: Infisical API Reference (EU), Endpunkte `POST /api/v1/folders`, `GET /api/v1/folders`, `GET /api/v3/secrets/raw`, `POST /api/v3/secrets/raw/{name}`.

## Grenzen

- Die Liste der Variablen liefert technisch auch Werte. Sie werden im Client sofort verworfen; nur Name und „leer“ verlassen die Funktion (Test mit Fixture, die einen Wert enthält).
- Schreibrecht: Die Identität `github-repos` liest nur. Für das Anlegen braucht es eine eigene Identität (Variable `INFISICAL_SCHREIB_IDENTITY_ID`), Rollen-Erweiterung laut AGENTS.md `risk:high` und Sinans Freigabe. Bis dahin laufen Abgleich und Erinnerung.
- Nicht live geprüft: ob Infisical eine Variable mit leerem Wert über die API annimmt; zeigt der erste Lauf einen Fehler, steht er im Protokoll.
- Schließen einer Erinnerung nach Titel (Muster „<Produkt>: Wert für `NAME` in Infisical eintragen“); gleiche Namen in mehreren Umgebungen teilen sich eine Aufgabe.
