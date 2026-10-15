# SIN-627: Fokus, Rollen pausieren bis MAF v1

Sinan, 14.10.2026: weniger Maschinerie, mehr Produkt (37 % der Arbeit am Loop selbst, ca. 45 Workflow-Läufe je Merge, 0 Demo-Anfragen).

- **Pausiert:** `marketing.yml` (war montags 06:17 UTC) und `trend.yml` (war täglich 04:30 UTC, sonntags mit Bewertung) ohne `schedule`, `workflow_dispatch` bleibt. `visionaer.yml` hatte nie einen Zeitplan (nur CEO oder von Hand). Video-/Werbeclip-Läufe und ein „Feature-Agent“ gibt es in diesem Repo nicht (kein Workflow, keine Rolle); dort ist nichts zu pausieren.
- **Anzeige:** `FOKUS_PAUSE` in `src/lib/wirkung/wirkung.ts` (marketing, trend, visionaer). Solange es kein jüngeres `ROLLE_PAUSE`-Ereignis mit Status `ok` gibt (ab 2026-10-14), gilt die Rolle als pausiert, Grund „pausiert bis MAF v1“. Unter „Mein Team“ steht der Grund, der Knopf „Wieder anschalten“ schreibt das Ereignis. Die 14-Tage-Auto-Pause rührt diese Rollen nicht an.
- **Wiederanschalten:** Der Knopf hebt die Anzeige-Pause auf; die Zeitpläne kommen nur zurück, wenn die `cron`-Zeilen (stehen als Kommentar im Dateikopf) von Hand oder per PR wieder eingetragen werden. Automatisch, sobald die Fertig-Liste der Lern-App v1 erfüllt ist: noch nicht gebaut, braucht den Stand der Lern-App (eigenes Issue).
- **Nicht umgesetzt:** Sperre für den Visionär-Aufruf des CEO (`scripts/ceo/ceo.ts`), Status-Lauf der Lern-App auf 15 Min (liegt im Lern-App-Repo, mit SIN-617 abstimmen), Messung vorher/nachher (braucht Läufe nach dem Merge; Zahlen hier nachtragen).

| | vorher | nachher |
|---|---|---|
| Geplante Läufe/Woche marketing + trend | 1 + 7 = 8 | 0 |
| Workflow-Läufe je Merge | ca. 45 (13.10.) | nach 7 Tagen messen und eintragen |
