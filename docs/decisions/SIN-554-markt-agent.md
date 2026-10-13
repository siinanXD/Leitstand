# SIN-554: Markt-Agent (Feature-Agent schaut auf die Konkurrenz)

- Logik rein in `src/lib/markt/markt.ts` (getestet), Netz und Dateien in `scripts/markt/markt.ts`, Auftrag in `docs/skills/markt/SKILL.md`.
- Suche und Auswertung macht Claude im Workflow mit WebSearch/WebFetch. Das Skript glaubt dem Ergebnis nicht: Es lehnt ab, wenn eine Zeile keine `https`-Quelle oder kein Abrufdatum hat oder weniger als 3 Anbieter belegt sind. Dann entsteht weder Datei noch Issue.
- Ideen: höchstens 3, Label `idee`, Meilenstein „v2 Ideen“, Status Backlog, ohne Priorität. Ein gleicher Titel im Projekt wird nicht doppelt angelegt. Der CEO (SIN-542) nimmt sie erst auf, wenn v1 fertig ist (SIN-528).
- Marketing-Agent (SIN-550): `botschaftenFuerMarketing` liefert die Werbebotschaften als `Eingabe.konkurrenz`. Die Verdrahtung in `scripts/marketing/marketing.ts` fehlt noch, siehe unten.
- Workflow: `docs/markt/markt.yml.vorlage` (1. des Monats, 05:23 UTC). Der Worker darf `.github/workflows/` nicht ändern.

## Aufgabe für Sinan (Label `sinan`)

1. `markt.yml` aus der Vorlage anlegen. In Linear müssen Label `idee` und der Projekt-Meilenstein „v2 Ideen“ im Projekt „Lern-App“ existieren (`MARKT_LINEAR_PROJEKT` anpassen, falls anders benannt). Secret `LINEAR_API_KEY` muss im Repo stehen.
2. Ersten Lauf von Hand mit `dry_run` starten, dann ohne.

## Ausgelassen

- `docs/markt/2026-11.md` liegt nicht bei: Der erste Lauf braucht Netz und Linear-Zugang und ist für den 1.11.2026 gedacht. Erfundene Anbieter oder Preise wären schlimmer als keine Datei.
- Nicht geprüft: Lauf des Workflows, Linear-Abfragen (nur nach der API-Dokumentation geschrieben), Abruf von Konkurrenzseiten.
- Je Produkt: nur ein Produkt pro Lauf (Lern-App). Weitere Produkte brauchen eigenen Pfad oder Unterordner, sobald eins dazukommt.
- Marketing-Verdrahtung (siehe oben) und Kachel auf der Übersicht: kein `loop_events`-Verbraucher vorhanden.
