# SIN-858: Bestandsabgleich 1/3, Evidenz sammeln

Teil von SIN-857. Erweitert den bestehenden Planer-Pfad um einen lesenden Sammler; kein neuer Agent, keine neue Datenbank, keine Modell-API.

## Schreibscope

- `src/lib/bestand/bestand.ts` (rein, getestet): JSON-Vertrag, Quellenisolation, Pagination (`holeSeiten`), Geheimnis-Prüfung (`mitGeheimnis`).
- `scripts/bestand/bestand.ts` (Netz, nur lesend): `npx tsx scripts/bestand/bestand.ts <produkt> <bereich> <feature> [begriff …]` schreibt `bestand-ausgabe/<produkt>-<bereich>.json`.
- `src/lib/loop/projekt-issues.ts`: optionaler Parameter für die Linear-Zustände (Standard unverändert), damit der Sammler auch erledigte Aufträge liest.
- `.github/workflows/build.yml`: Trockenlauf des Skripts (`DRY_RUN=1`, SIN-574).
- Nicht angefasst: Planer-Prompt und Planer-Entscheidung (das ist 2/3 und 3/3), Rechte, Secrets, Schema.

## Vertrag

`produkt, bereich, feature, quellen, vorhandene_bausteine, offene_arbeit, fehlende_nachweise, quellfehler`. Jede Quelle trägt `ref`, `sha` (Commit-SHA bzw. Vault-SHA; Linear hat keine, PR-Köpfe stehen als `Head <sha>` im Titel) und `status`. Berichte enthalten nur Titel und Links, keine Notizinhalte, keine Beschreibungen, keine Repo-Kopie. Ein Treffer mit Geheimnis verwirft die ganze Quelle als Quellfehler.

## Verhalten bei Fehlern

Jede Quelle wird einzeln gelesen. Fällt eine aus, bleibt sie als `quellfehler` und als `fehlende_nachweise` („nicht lesbar, keine Aussage möglich“) im Bericht, die anderen bleiben auswertbar; ein anderer Bereich ist ohnehin ein eigener Bericht (`sammleAlle`). Pagination liefert bei Fehler auf einer Folgeseite oder mehr als 100 Seiten keine Teilmenge.

## Grenzen

- Evidenz, keine Fertig-Entscheidung. „Kein Test gefunden“ heißt nur: kein Dateiname mit dem Begriff.
- Trefferlogik ist ein Wortvergleich auf Titel und Pfad (`begriffe`, sonst Wörter ab 4 Zeichen aus `feature`). shortcut: Wortvergleich statt Suche, ausbauen wenn 2/3 Fehlalarme zeigt.
- Kein Caching, deshalb keine behauptete Aktualität; jede Zahl hat die SHA des Laufs.
- Linear: Seitenweise Abfrage wie in SIN-825 (25 je Seite, Cursor-Prüfung), nur mit allen Zustandstypen.

## Offen für den Live-Nachweis

Das echte lesende Inventar (verlinktes JSON) fehlt noch: in der Worker-Umgebung konnte das Skript nicht gestartet werden. Aufgabe für Sinan: einmal `Bestandsabgleich` mit `GH_TOKEN` und `LINEAR_API_KEY` laufen lassen, das JSON nach `docs/bestand/` legen und hier verlinken. Regel und Tests allein sind kein Live-Nachweis, das Issue bleibt bis dahin „In Review“.
