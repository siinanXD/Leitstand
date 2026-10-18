# SIN-825: Linear-Projekt-Issues seitenweise lesen

Der Planer-Lauf [39153619901](https://github.com/siinanXD/Leitstand/actions/runs/39153619901) wurde mit HTTP 400 abgelehnt: Komplexität 15015 statt maximal 10000. Die Abfrage verlangte 100 Issues mitsamt Labels und verschachtelten Blocker-Relationen.

Planer und Dispatcher verwenden dieselbe lesende Abfrage und deshalb jetzt denselben Loader: 25 Issues je Seite, Fortsetzung über `pageInfo.endCursor` bis `hasNextPage` falsch ist. Fehlende oder wiederholte Cursor brechen ab; Fehler liefern keinen unvollständigen Plan. Team, Startzeit, Labels, Status und Blocker bleiben erhalten. Die bisherige Begrenzung verschachtelter Connections auf Linears Standard von 50 bleibt unverändert.

Quellen, gelesen am 18.10.2026: [Pagination](https://linear.app/developers/pagination), [Komplexitätslimit](https://linear.app/developers/rate-limiting).

Abnahme: `leitstand-planer-pagination` in `docs/abnahme.yml` prüft einen erfolgreichen Planer-Lauf innerhalb von 26 Stunden. Unit-Tests prüfen mehrere Seiten, leere Projekte, Folgeseitenfehler und Cursor-Abbruch. Ein grüner Build ersetzt den Live-Nachweis nicht.

Ausgelassen: keine Änderungen an Secrets, Infisical, Rechten, Merge-Gates oder Datenbankschema. Die Infisical-Migration bleibt gemäß SIN-611 pausiert.
