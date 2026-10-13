# SIN-541: Gedächtnis-Agent pflegt den Obsidian-Vault

- Reine Markdown-Erzeugung in `src/lib/gedaechtnis/gedaechtnis.ts` (getestet), Netz und Push in `scripts/gedaechtnis/schreiben.ts`. Fünf Dateitypen: `00 Wo stehen wir`, `Produkte/`, `Tage/`, `Entscheidungen/`, `Offen`.
- Grenzen im Code: „Wo stehen wir“ höchstens 25 Zeilen (je Produkt 3, mehr als 5 Produkte stehen nur unter `Produkte/`), ein Tag höchstens 30 Zeilen.
- Push per `git` mit Kopfzeile (`http.extraHeader`), das Token steht weder in der URL noch in `.git/config` noch in Fehlermeldungen. Geändert wird nur, wenn `git status` Unterschiede zeigt.
- Zugriff fehlt (Repo nicht lesbar, anlegen scheitert, `DRY_RUN=1`): Ausgabe in `gedaechtnis-ausgabe/` (Artefakt), `status: braucht_sinan`, Exit 0. Das Skript legt das Repo höchstens einmal **privat** an, nie öffentlich, und ändert keine Token-Rechte.
- Vor dem Schreiben prüft `mitGeheimnis` jede Datei (Token-Muster, `service_role`, Schlüssel). Ein Treffer bricht ab.
- Entscheidungen: nur Link auf die Datei im Repo, keine Kopie des Inhalts. Titel aus dem Dateinamen.
- Kachel „Gedächtnis“ liest den letzten `loop_events`-Eintrag mit Schritt `gedaechtnis` (wird nur nach einem Push geschrieben).
- Der Workflow liegt als Vorlage in `docs/gedaechtnis/gedaechtnis.yml.vorlage`: Der Worker darf `.github/workflows/` nicht ändern.

## Aufgabe für Sinan (Label `sinan`)

`.github/workflows/gedaechtnis.yml` aus der Vorlage anlegen. [SIN-540](https://linear.app/sinan-kahraman/issue/SIN-540/privates-repo-gedaechtnis-anlegen-und-in-obsidian-offnen) bleibt offen, bis der Lauf `status: braucht_sinan` nicht mehr meldet (Repo `siinanXD/gedaechtnis`, Token mit Schreibrecht).
