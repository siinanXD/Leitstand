# SIN-598: Nächste Schritte planen

Der Worker hat in diesem Lauf keinen Zugriff auf die Linear-API (`LINEAR_API_KEY` steht nicht in `claude.yml`). Darum legt er die Issues nicht selbst an, sondern nennt sie hier. Anlegen: Backlog, Projekt „Leitstand“, Label `claude` (bei `sinan` stattdessen `sinan`). Nichts gelöscht. Belege stammen aus dem Repo, keine Zahlen erfunden.

## 1. Offene Sinan-Schritte aus den Entscheidungsdateien bündeln (Label `sinan`)

- **Ziel:** Mehrere Entscheidungsdateien (zum Beispiel SIN-572, SIN-542, SIN-553) enthalten „Aufgabe für Sinan“: Secrets und `LINEAR_API_KEY` in Workflows ergänzen (Worker darf `.github/workflows/` nicht ändern), Migrationen aus `docs/autonomy/*.vorlage` nach `supabase/migrations/` verschieben.
- **Fertig, wenn:** Jede dieser Aufgaben ist erledigt oder bewusst gestrichen, und die Abschnitte in den Entscheidungsdateien nennen den Stand.

## 2. `docs/FERTIG.md` mit den offenen Punkten füllen (Label `sinan`)

- **Ziel:** Die Liste ist leer. Der CEO legt deshalb nichts an und der Leitstand zeigt keinen Fortschritt (SIN-572).
- **Fertig, wenn:** Die Liste enthält die offenen v1-Punkte als `- [ ] Titel`; `fertig_v1`/`gesamt_v1` erscheinen im Snapshot.

## 3. Wächter: CI-Status der `claude/`-PRs mitladen (Label `claude`)

- **Ziel:** `src/lib/waechter/waechter.ts` setzt CI-Grün immer auf `false` (Kommentar `shortcut`), „Braucht dich“ kann grüne PRs nicht erkennen.
- **Fertig, wenn:** Der Check-Status kommt aus GitHub, mit Test in `src/lib/waechter/`; `npm run typecheck`, `lint`, `test` grün.

## 4. Anwesenheit der Supabase-Migrationen im Betrieb prüfen (Label `claude`)

- **Ziel:** Nach SIN-592 meldet der Leitstand fehlende Migrationen; `docs/autonomy/` hält noch Vorlagen (`loop_snapshot_queue`, `loop_snapshot_plan`), die nie Teil von `supabase/migrations/` wurden. Klären, welche davon gebraucht werden, und Entscheidung in `docs/decisions/` festhalten.
- **Fertig, wenn:** Jede Vorlage ist entweder als Migration vorgeschlagen (Freigabe durch Sinan, wegen Datenänderung `risk:high` möglich) oder gelöscht begründet.

## 5. Routen ohne Design-Issue in Figma nachziehen (Label `sinan`)

- **Ziel:** `docs/design/OFFEN-FIGMA.md` ist die Schuldenliste für Figma (SIN-574); Claude zieht sie wöchentlich im Chat nach.
- **Fertig, wenn:** Die Tabelle ist leer oder jede Zeile jünger als 14 Tage.

## Ausgelassen

Keine Linear-Issues angelegt (kein API-Zugriff), Stand nur aus dem Repo gelesen, Linear selbst nicht geprüft.
