# SIN-508 — Stand-Agent: eine Wahrheit je Thema

**Links:** Linear [SIN-508](https://linear.app/sinan-kahraman/issue/SIN-508), Rolle **Betrieb** in `src/data/agents.json`.

## Entscheidung

- Eigener, fester Abgleich statt KI: `docs/stand.json` sagt je Thema, was die Wahrheit ist und wer davon abhängt. `src/lib/stand/stand.ts` (rein, mit Fixture-Tests der Fälle vom 12.10.) vergleicht, `scripts/stand/pruefen.ts` holt die Daten und schreibt `stand-bericht.json` (ok / veraltet / fehlt, je mit Link).
- Quellen, die nicht erreichbar sind (fehlendes Token), erscheinen als **fehlt**, nie als ok.
- Abweichungen: Doku, Zahlen und Status-Texte behebt der Agent per PR. Design wird ein Issue mit Label `design`, Datenbank ein Issue mit Label `sinan` (`umgang()` in `stand.ts`).
- Ereignis in `loop_events`: Agent `betrieb`, Schritt `stand`, Status `needs_human` nur bei Abweichung, sonst `ok`.
- Datenbank-Abgleich: eigener Vergleich der Migrationsdateien mit `supabase_migrations.schema_migrations` über die Supabase-Management-API (`SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`). **Atlas Drift Detection** ist eine kostenpflichtige Cloud-Funktion und wird nicht genommen.

## GitHub Agentic Workflows (`githubnext/gh-aw`)

Nicht genommen, vorerst. Unser Abgleich braucht keine KI; gh-aw ist laut GitHub Technical Preview. Lizenz, Sterne und letzten Commit nach unseren Regeln (MIT/Apache, Commit < 6 Monate, > 500 Sterne, siehe `bausteinErlaubt`) habe ich in diesem Lauf **nicht geprüft**, weil kein Webzugriff genutzt wurde. Vor einer Übernahme der Vorlage „Daily Documentation Updater“ (Schreibrechte nur über „safe outputs“) einmal nachholen. Für die Textvergleiche (Doku ↔ Code) bleibt das der natürliche Kandidat.

## Umgesetzt (dieser PR)

- `docs/stand.json` für den Leitstand, Prüfungen für Design, Datenbank, Doku, Linear ↔ GitHub, Leitstand ↔ `loop_events`, Content.
- Betrieb-Agent kennt den Schritt `STAND`.

## Noch offen

- **Workflow `stand.yml`** (täglich 06:15 + nach jedem Merge, Bericht als Artefakt): Agenten dürfen `.github/workflows/` nicht ändern. Fertige Vorlage: `docs/stand/stand.yml.vorlage`; Sinan kopiert sie nach `.github/workflows/stand.yml`.
- Content-Landkarte (Figma) wird noch nicht gelesen, die Prüfung meldet das als „fehlt“. Tabellen- und Spaltennamen der Lern-App (`content.*` in `stand.json`) sind dort einzutragen; für den Leitstand gibt es keinen Content-Block.
- `docs/stand.json` und die Datei `docs/LANDKARTE.md` für die Lern-App; Projekt-Wächter soll `stand.json` für neue Projekte anlegen (`src/lib/waechter/`).
- Anzeige unter „Braucht dich“ in der Übersicht: dort zählt bisher nur der Snapshot (`brauchtDich`). Das Ereignis `stand`/`needs_human` ist vorbereitet, die Anzeige fehlt.
- Automatische Korrektur-PRs und Issues (`umgang()` liefert die Entscheidung, die Ausführung fehlt).
