# SIN-637: Ergebnis-Kennzahl je Rolle mit Auto-Pause

Stand 2026-10-15. „ok“ zählt nicht, nur Wirkung.

- **Register:** `docs/autonomy/agents.json` trägt je Rolle `wirkung` (`kennzahl`, `ziel`). `registerFehler` verlangt beides. Die Kennzahlen für Worker, Planer, Prüfer, Gedächtnis, Content und Hausmeister stehen im Issue; die übrigen sind Vorschläge und können Sinan ändern.
- **Ereignis:** Jede Rolle schreibt bei jedem Lauf `agent`, `wirkung` (Zielerreichung 0 bis 1) und `grund` in `loop_events`. Neue Spalte `wirkung` (Migration `20261015000000_loop_events_wirkung.sql`, additiv).
- **Läuft nicht:** kein Ereignis der Rolle in 48 Stunden (Abnahme-Proben `leitstand-rolle-*`).
- **Note:** `1 + round((1 − Wirkung) × 5)`, Mittel der letzten 7 Tage; ohne Messwert keine Note.
- **Auto-Pause:** `scripts/wirkung/wirkung.ts` (täglich) schreibt ein Ereignis `ROLLE_PAUSE` (Status `uebersprungen`) für jede Rolle ohne Wirkung über 0 in 14 Tagen. Die Frist zählt frühestens ab 2026-10-15, sonst pausierten alle Rollen sofort. `push-ausloeser` sendet dazu einen Alarm mit Begründung. Der Knopf „Wieder anschalten“ unter „Mein Team“ schreibt `ROLLE_PAUSE` mit Status `ok`.
- **Offen:** Die Rollen-Skripte und -Workflows schreiben die Wirkung noch nicht; jede Rolle bekommt dafür ein eigenes Folge-Issue. Bis dahin sind die Proben rot und die Noten leer. Das Pausen-Ereignis wird von den Rollen noch nicht beachtet. Die Rolle „Testnutzer“ fehlt (braucht Skill, Schema, Fixture).
