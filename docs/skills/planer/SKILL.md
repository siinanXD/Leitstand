# Skill: Planer (SIN-636, ersetzt Vorarbeiter und die Planung des CEO)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: eine Planer-Rolle für beide Repos. Liest die Fertig-Liste (`docs/FERTIG.md` bzw. `product-readiness.json`), die Abnahme-Proben, Fehlergründe und den Gesprächs-Eingang aus dem Gedächtnis, legt Issues an, legt Reihenfolge und Spur fest (A, B = Claude Max, C = API mit Haiku). Auslöser, Netz und Werkzeuge stehen in `docs/autonomy/agents.json`.

1. Vor jedem neuen Issue die Dubletten-Prüfung (SIN-613): Titel gegen alle Linear-Issues des Projekts, auch erledigte und abgebrochene. Gleiche Absicht (ähnliche Stichwörter, nicht nur gleicher Titel) wird nie noch einmal angelegt; höchstens ein Kommentar am vorhandenen Issue. Höchstens 3 neue Ideen-Issues je Projekt und Lauf. Übersprungene Dubletten stehen im Lauf-Log.
1a. **Idee-Sperre (SIN-761):** Solange `docs/FERTIG.md` (Lern-App: deren `docs/FERTIG.md`) offene Punkte hat (`ideenGesperrt` in `src/lib/ceo/fertig.ts`), legst du keine neuen `idee`-Issues an. Nur Bugs mit Nutzerwirkung dürfen rein. Alles andere ist v2. Meta-Issues (Kosten-Beleg, Stillstand, Snapshot) höchstens 1 pro Tag und Produkt.
2. Lege Issues an, wenn weniger als 3 startbar sind (`luecke` in `src/lib/ceo/ceo.ts`). Der CEO legt kein Issue an.
3. Reihenfolge und Spuren: `src/lib/vorarbeiter/vorarbeiter.ts` (Name aus der Zeit vor SIN-636, Entscheidung in `docs/decisions/SIN-553-vorarbeiter.md`).
4. Größe (SIN-638): Schneide Issues auf höchstens ca. 300 geänderte Zeilen oder 1 Bereich (Frontend, Backend, Content, Infra). Größere zerlegst du vorher in Unter-Issues; dasselbe nach 2 roten Worker-Läufen (Ursache und Vorschlag stehen im Kommentar des Workers).
5. Ausgabe nur als JSON nach `docs/schemas/planer.json`, Datei `docs/autonomy/laeufe/<ISSUE-ID>.json`. Prüfen: `npx tsx scripts/autonomy/schema.ts planer <datei>`. Kein Freitext.

Entscheidung und Vorher/Nachher der Workflow-Läufe: `docs/decisions/SIN-636-ein-planer.md`.
