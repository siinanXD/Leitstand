# SIN-612: Gesprächs-Eingang fürs Gedächtnis

- Linear ist der Briefkasten: Claude legt am Ende eines Gesprächs ein Issue mit Label `gedaechtnis` an (Titel = Thema, Text = Entscheidungen, Ideen, offene Fragen, Datum, Repos).
- Der Gedächtnis-Agent (`scripts/gedaechtnis/schreiben.ts`, täglich 05:50 UTC) holt Issues mit diesem Label, die in den letzten 14 Tagen geändert wurden, und schreibt je Issue eine Notiz `Eingang/SIN-xxx.md` (reine Logik in `src/lib/gedaechtnis/eingang.ts`, getestet).
- Der Dateiname hängt nur an der Kennung: wird ein Issue nachträglich geändert, wird dieselbe Notiz überschrieben (kein Doppel). Die Art (`#entscheidung` oder `#idee`) steht als Tag und im Kopf, nicht im Pfad, sonst gäbe es bei einer Änderung zwei Dateien.
- Verweise: Nennt der Text eine andere Eingangs-Kennung, steht unter „Siehe auch“ ein Obsidian-Link; jede Notiz verlinkt den Tag und „Wo stehen wir“.
- Nach dem Push bekommt jedes noch offene Issue einen Kommentar mit Link auf die Notiz und wird auf „erledigt“ gesetzt. Ohne Push (Trockenlauf, kein Zugriff auf den Vault) bleibt es offen.
- Das Label wird im Team SIN angelegt, falls es fehlt. Die Geheimnisprüfung (`mitGeheimnis`) gilt auch für Eingangs-Notizen.
- Ohne `LINEAR_API_KEY` im Workflow entfällt der Eingang mit einer Warnung.
- shortcut: höchstens 50 Issues je Lauf, Text auf 8000 Zeichen gekürzt; bei mehr Andrang Seiten abfragen.

## Aufgabe für Sinan

Secret `LINEAR_API_KEY` im Repo setzen (bis SIN-611 es aus Infisical holt); sonst läuft der Eingang nicht.
