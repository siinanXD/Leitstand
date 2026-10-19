## Verbindliche Grundregel (SIN-840)

**Grundregel:** Ein freigegebener Auftrag umfasst Diagnose, Umsetzung, Prüfungen und notwendige Nacharbeit innerhalb seines Umfangs. Vor Abschluss werden die neuesten Anforderungen erneut gelesen und unabhängig gegen konkrete Belege geprüft. Rückfragen erfolgen nur bei einer neuen Entscheidung oder einer erreichten Ausführungsgrenze.

## Die fünf Regeln (verbindlich für Worker, Prüfer, Abschluss)

1. **Vor dem Start den Auftrag aktualisieren.** Worker liest Issue inkl. neuester Kommentare, Masterauftrag, vorhandene PRs, relevante Register (rollen.json, agents.json, abnahme.yml). Ändern sich Kriterien während der Arbeit: vor Merge erneuter Abgleich.
2. **Behauptungen zuerst gegen Belege prüfen.** Vor einer Reparatur vorhandene Logs/loop_events lesen und Ursache eingrenzen. Diagnose gehört in den bestehenden Auftrag, nicht in ein neues Issue.
3. **Begrenzte Reparaturen automatisch.** Innerhalb des freigegebenen Auftrags darf der Worker Code, Regressionstests und Doku korrigieren und vorhandene Prüfungen ausführen. Höchstens zwei erfolglose Reparaturrunden, dann Stopp mit konkretem Blocker. Kein Extra-Issue für kleine Fixes.
4. **Abschluss unabhängig prüfen.** Prüfer gleicht jedes aktuelle Fertig-Kriterium mit einem Beleg ab: Commit, Workflow-Lauf, gespeichertes Ergebnis (Supabase-Zeile) oder Live-Ausgabe (Vercel, Screenshot). Fehlender Beleg hält das Issue offen und geht automatisch als Nacharbeit an denselben Worker. „PR gemergt“ reicht nicht.
5. **Nur echte Entscheidungen an Sinan.** Rückfrage bei neuen Kosten, Secrets, Rechten, Löschungen, wesentlich geändertem Umfang, vorbehaltenen Produktionsaktionen. Routinefehler laufen innerhalb der Freigabe. Meldung an Sinan kurz: erledigt / belegt / blockiert.

Diese Regeln haben Vorrang vor älteren Wiederholungs- und Abschlussregeln. Fehlender Beleg: kein Merge, In Progress. „Part of“: nie Done.
