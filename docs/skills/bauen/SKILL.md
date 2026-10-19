# Skill: Bauen (SIN-543)

## Verbindliche Grundregel (SIN-840)

**Grundregel:** Ein freigegebener Auftrag umfasst Diagnose, Umsetzung, Prüfungen und notwendige Nacharbeit innerhalb seines Umfangs. Vor Abschluss werden die neuesten Anforderungen erneut gelesen und unabhängig gegen konkrete Belege geprüft. Rückfragen erfolgen nur bei einer neuen Entscheidung oder einer erreichten Ausführungsgrenze.

## Die fünf Regeln (verbindlich für Worker, Prüfer, Abschluss)

1. **Vor dem Start den Auftrag aktualisieren.** Worker liest Issue inkl. neuester Kommentare, Masterauftrag, vorhandene PRs, relevante Register (rollen.json, agents.json, abnahme.yml). Ändern sich Kriterien während der Arbeit: vor Merge erneuter Abgleich.
2. **Behauptungen zuerst gegen Belege prüfen.** Vor einer Reparatur vorhandene Logs/loop_events lesen und Ursache eingrenzen. Diagnose gehört in den bestehenden Auftrag, nicht in ein neues Issue.
3. **Begrenzte Reparaturen automatisch.** Innerhalb des freigegebenen Auftrags darf der Worker Code, Regressionstests und Doku korrigieren und vorhandene Prüfungen ausführen. Höchstens zwei erfolglose Reparaturrunden, dann Stopp mit konkretem Blocker. Kein Extra-Issue für kleine Fixes.
4. **Abschluss unabhängig prüfen.** Prüfer gleicht jedes aktuelle Fertig-Kriterium mit einem Beleg ab: Commit, Workflow-Lauf, gespeichertes Ergebnis (Supabase-Zeile) oder Live-Ausgabe (Vercel, Screenshot). Fehlender Beleg hält das Issue offen und geht automatisch als Nacharbeit an denselben Worker. „PR gemergt“ reicht nicht.
5. **Nur echte Entscheidungen an Sinan.** Rückfrage bei neuen Kosten, Secrets, Rechten, Löschungen, wesentlich geändertem Umfang, vorbehaltenen Produktionsaktionen. Routinefehler laufen innerhalb der Freigabe. Meldung an Sinan kurz: erledigt / belegt / blockiert.

Diese Regeln haben Vorrang vor älteren Wiederholungs- und Abschlussregeln. Fehlender Beleg: kein Merge, In Progress. „Part of“: nie Done.


Es gilt `docs/STANDARD.md` (SIN-641).
Verbindlicher Ablauf: `docs/autonomy/AUFTRAGSABGLEICH.md` (SIN-754). Vor Bau und vor jedem Push den aktuellen Linear-Auftrag mit Kommentaren/Eltern-/Masterauftrag lesen. Diagnose anhand vorhandener Logs/Register belegen; reversible Nacharbeit im Auftrag selbst erledigen. Fehlende Live-Probe getrennt von fehlender Implementierung ausweisen.

Aufgabe: Code, Design aus Figma, Content und Video. `content`, `video` und `marketing` sind Aufgabenarten von Bauen, keine eigenen Agenten.

1. `AGENTS.md` und `docs/skills/ponytail/SKILL.md` gelten. Doku über Context7 holen, Figma-Werte mit `npx tsx scripts/figma.ts`.
2. Fehlt eine fertige Lösung, fordere Research an, statt zu raten.
3. Ein PR pro Linear-Issue, Commits mit `Part of SIN-xxx`.
4. Ausgabe als JSON nach `docs/schemas/bauen.json`, Datei `docs/autonomy/laeufe/<ISSUE-ID>.json`. PR-Beschreibung und Linear-Kommentar werden aus dem JSON erzeugt.
5. Erst Test, dann Code (SIN-638): Schreibe zuerst den Test oder die Abnahme-Probe aus den „Fertig, wenn“-Punkten, prüfe, dass er rot ist, und baue dann.
6. Größe: höchstens ca. 300 geänderte Zeilen oder 1 Bereich (Frontend, Backend, Content, Infra). Ist das Issue größer, baue nicht, sondern schlage dem Planer die Zerlegung vor.
7. Zwei rote Läufe: Der erste rote Build zählt als Fehlversuch 1; genau eine Reparatur ist erlaubt. Nach dem zweiten roten Build kein dritter Neustart. Kommentiere Ursache und Vorschlag zum Zerlegen; der Planer legt Unter-Issues an.
8. Jeder rote Lauf trägt einen `grund` (SIN-617).
9. Kontext schlank: Issue, betroffene Dateien, `AGENTS.md`, dieser Skill und passende Lehren (`LEHREN.md`), nicht das ganze Repo.
