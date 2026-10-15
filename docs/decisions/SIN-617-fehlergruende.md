# SIN-617: Fehler mit Grund speichern

Stand 2026-10-15. Risiko: medium.

## Entscheidung

- Jeder Eintrag mit `status = fehler` in `loop_events` trägt `grund` als „<Kategorie>: <erste Fehlerzeile>“. Kategorien: Kontingent, Test rot, Merge-Konflikt, Zeitüberschreitung, Rechte fehlen, Sonstiges. Logik rein in `src/lib/loop/fehlergrund.ts`.
- `scripts/loop/loop.ts` verlangt den Grund per Typ: `ereignis(…, "fehler", …)` kompiliert nur mit `grund`.
- Leitstand: Kachel „Häufigste Fehlergründe (24 h)“ auf `/details` zeigt die Top 3 (`topGruende`).
- Lern-Agent: liest `grund` mit und gruppiert wiederkehrende Fehler nach Kategorie (`hinweiseAusEreignissen`).

## Takt von `status` und `pr-gate`

`status` (507 Läufe in 48 h) und `pr-gate` (754) laufen im Lern-App-Repo, nicht hier. Empfehlung: `status` auf alle 15 Minuten (`*/15`), `pr-gate` nur bei `pull_request`-Ereignissen statt per Zeitplan. Die Änderung gehört in die Workflows der Lern-App und liegt außerhalb dieses PRs.

## Offen (Lern-App)

Die Worker- und `pr-gate`-Workflows der Lern-App müssen beim Fehler `grund` mitschreiben (Aufruf von `fehlergrund`). Bis dahin bleiben dortige Fehler „Ohne Grund“ und sind in der Kachel sichtbar.
