# SIN-604: Nächste Schritte planen

Der Worker kann in diesem Lauf keine Linear-Issues anlegen: `LINEAR_API_KEY` ist in `claude.yml` verdrahtet, die Shell des Laufs lässt den Zugriff auf die Variable aber nicht zu. Darum stehen die Vorschläge hier. Anlegen: Backlog, Projekt „Leitstand“, Label wie angegeben. Nichts gelöscht. Linear selbst wurde nicht gelesen, die Dubletten-Prüfung (SIN-613) gegen vorhandene Issues steht beim Anlegen noch aus. Belege stammen aus dem Repo, keine Zahlen erfunden.

Gegenüber SIN-598 erledigt: `docs/FERTIG.md` ist gefüllt (SIN-618), die `.vorlage`-Dateien in `docs/autonomy/` gibt es nicht mehr, der Wächter lädt den CI-Status (SIN-635).

## 1. Fertig-Liste mit Belegen abhaken (Label `sinan`)

- **Ziel:** Alle Punkte in `docs/FERTIG.md` stehen auf `[ ]`, die Belegtabelle in `docs/decisions/SIN-618-fertig-liste.md` ist leer. Nur Sinan sieht live, was wirklich läuft.
- **Fertig, wenn:** Jeder laufende Punkt ist mit `[x]` und einer Zeile (PR, Nachweis) belegt; `fertig_v1` im Snapshot ist größer als 0.

## 2. Frames für Seiten ohne Figma-Frame entscheiden (Label `sinan`)

- **Ziel:** `docs/design/ABGLEICH-SIN-660.md` nennt sechs Seiten ohne Frame (Abnahme, Kosten, Team, Werkzeuge, Einstellungen, Freigabe Werbemittel); `docs/design/OFFEN-FIGMA.md` hat vier offene Zeilen.
- **Fertig, wenn:** Je Seite steht fest: Frame in Figma ergänzt oder Seite verschoben; `OFFEN-FIGMA.md` hat keine Zeile älter als 14 Tage.

## 3. CEO-Dubletten nach Absicht statt nur nach Titel prüfen (Label `claude`, Bereich Backend)

- **Ziel:** `neueIssueTitel` in `src/lib/ceo/` erkennt nur gleiche Titel (siehe SIN-618). Der Planer-Skill verlangt Dubletten-Prüfung nach Stichwörtern.
- **Fertig, wenn:** Ähnliche Titel (gleiche Stichwörter) gelten als Dublette, mit Test zuerst (rot, dann grün); `npm run typecheck`, `lint`, `test` grün.

## 4. Abnahme-Proben für die Fertig-Liste ergänzen (Label `claude`, Bereich Infra)

- **Ziel:** `docs/abnahme.yml` prüft Snapshot, Ereignisse, Health, Aufgaben und Werkzeuge. Für die Punkte aus „Handeln“ und „Melden“ in `docs/FERTIG.md` fehlen Proben.
- **Fertig, wenn:** Mindestens je ein Punkt aus „Handeln“ und „Melden“ hat eine Probe (HTTP, lesende Abfrage oder Datei-Check) mit erwartetem Ergebnis; Trockenlauf `DRY_RUN=1` grün.

## Ausgelassen

Keine Linear-Issues angelegt, Linear nicht gelesen, keine Tests gebaut (nur Doku).
