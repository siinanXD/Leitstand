# SIN-541: Gedächtnis-Agent pflegt den Obsidian-Vault

- Reine Markdown-Erzeugung in `src/lib/gedaechtnis/gedaechtnis.ts` (getestet), Netz und Push in `scripts/gedaechtnis/schreiben.ts`. Fünf Dateitypen: `00 Wo stehen wir`, `Produkte/`, `Tage/`, `Entscheidungen/`, `Offen`.
- Grenzen im Code: „Wo stehen wir“ höchstens 25 Zeilen (je Produkt 3, mehr als 5 Produkte stehen nur unter `Produkte/`), ein Tag höchstens 30 Zeilen.
- Push per `git` mit Kopfzeile (`http.extraHeader`), das Token steht weder in der URL noch in `.git/config` noch in Fehlermeldungen. Geändert wird nur, wenn `git status` Unterschiede zeigt.
- Zugriff fehlt (Repo nicht lesbar, anlegen scheitert, `DRY_RUN=1`): Ausgabe in `gedaechtnis-ausgabe/` (Artefakt), `status: braucht_sinan`, Exit 0. Das Skript legt das Repo höchstens einmal **privat** an, nie öffentlich, und ändert keine Token-Rechte.
- Vor dem Schreiben prüft `mitGeheimnis` jede Datei (Token-Muster, `service_role`, Schlüssel). Ein Treffer bricht ab.
- Entscheidungen: nur Link auf die Datei im Repo, keine Kopie des Inhalts. Titel aus dem Dateinamen.
- Kachel „Gedächtnis“ liest den letzten `loop_events`-Eintrag mit Schritt `gedaechtnis` (wird nur nach einem Push geschrieben).
- Der Workflow liegt als Vorlage in `docs/gedaechtnis/gedaechtnis.yml.vorlage`: Der Worker darf `.github/workflows/` nicht ändern.

## Korrektur SIN-614: keine leeren Stände

- `Offen.md` kommt aus Linear (alle offenen Issues mit Label `sinan`) plus wartende Freigaben aus `loop_snapshot`; gleiche Kennung zählt einmal (`vereinige`).
- „Läuft“ aus `loop_snapshot` und `loop_events` (24 h), für die Lern-App zusätzlich die Content-Fabrik (Ereignis der letzten 2 h mit „content“ oder „fabrik“ im Schritt oder Agenten; shortcut: Namensmuster, bis die Fabrik einen festen Schritt schreibt).
- Leitstand-Stand: fehlt er im Snapshot, zählt das Skript `docs/FERTIG.md` selbst (`zaehleHaken`).
- `Tage/<Datum>.md` nennt gemergte PRs beider Repos (nicht nur der Produkte aus dem Snapshot) und die in Linear erledigten Issues der letzten 24 h.
- Antwortet eine Quelle (Linear, Supabase, GitHub) nicht, steht „Quelle nicht erreichbar“ statt „nichts“ (`Eingabe.fehlt`, `null` bei Listen).
- Lern-App „200/227 fertig“: die Zahl kommt aus `fertig_v1`/`gesamt_v1` des Lern-App-Status-Laufs und wird unverändert übernommen. Ob sie die Fertig-Liste (19 Punkte) meint, muss dort geprüft werden; dieser PR ändert die Lern-App nicht.

## Aufgabe für Sinan (Label `sinan`)

`.github/workflows/gedaechtnis.yml` aus der Vorlage anlegen. [SIN-540](https://linear.app/sinan-kahraman/issue/SIN-540/privates-repo-gedaechtnis-anlegen-und-in-obsidian-offnen) bleibt offen, bis der Lauf `status: braucht_sinan` nicht mehr meldet (Repo `siinanXD/gedaechtnis`, Token mit Schreibrecht).
