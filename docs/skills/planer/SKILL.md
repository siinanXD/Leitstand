# Skill: Planer (SIN-636, ersetzt Vorarbeiter und die Planung des CEO)

Es gilt `docs/STANDARD.md` (SIN-641).

## Codex-Rollen (SIN-1052)

Claude übernimmt Implementierung und Reparatur. Abgegrenzte unabhängige Reviews, Planung oder Content-Entwürfe können Label `codex` und genau einen Rollenmarker `<!-- codex-rolle: review -->`, `<!-- codex-rolle: planer -->` oder `<!-- codex-rolle: content -->` erhalten. Ergebnis und Schreibpfade ausdrücklich benennen; Review/Planung ändern keinen Produktcode, Content wird nicht veröffentlicht. Höchstens ein Codex-Auftrag gleichzeitig über alle gesteuerten Projekte. Vorhandene Claude-PRs werden nicht parallel übernommen. Konto-/Abo-Nutzung ist kein durch Labels beweisbarer Zustand; API-Prüfer bleibt ein eigener Zugang.

Aufgabe: eine Planer-Rolle für beide Repos. Liest die Fertig-Liste (`docs/FERTIG.md` bzw. `product-readiness.json`), die Abnahme-Proben, Fehlergründe und den Gesprächs-Eingang aus dem Gedächtnis, legt Issues an, legt Reihenfolge und Spur fest (A, B = Claude Max, C = API mit Haiku). Auslöser, Netz und Werkzeuge stehen in `docs/autonomy/agents.json`.

1. Vor jedem neuen Issue die Dubletten-Prüfung (SIN-613): Titel gegen alle Linear-Issues des Projekts, auch erledigte und abgebrochene. Gleiche Absicht (ähnliche Stichwörter, nicht nur gleicher Titel) wird nie noch einmal angelegt; höchstens ein Kommentar am vorhandenen Issue. Höchstens 3 neue Ideen-Issues je Projekt und Lauf. Übersprungene Dubletten stehen im Lauf-Log.
1a. **Idee-Sperre (SIN-761):** Solange `docs/FERTIG.md` (Lern-App: deren `docs/FERTIG.md`) offene Punkte hat (`ideenGesperrt` in `src/lib/ceo/fertig.ts`), legst du keine neuen `idee`-Issues an. Nur Bugs mit Nutzerwirkung dürfen rein. Alles andere ist v2. Meta-Issues (Kosten-Beleg, Stillstand, Snapshot) höchstens 1 pro Tag und Produkt.
2. Lege Issues an, wenn weniger als 3 startbar sind (`luecke` in `src/lib/ceo/ceo.ts`). Der CEO legt kein Issue an.
3. Reihenfolge und Spuren: `src/lib/vorarbeiter/vorarbeiter.ts` (Name aus der Zeit vor SIN-636, Entscheidung in `docs/decisions/SIN-553-vorarbeiter.md`).
4. Größe (SIN-638): Schneide Issues auf höchstens ca. 300 geänderte Zeilen oder 1 Bereich (Frontend, Backend, Content, Infra). Größere zerlegst du vorher in Unter-Issues; dasselbe nach 2 roten Worker-Läufen (Ursache und Vorschlag stehen im Kommentar des Workers).
5. Ausgabe nur als JSON nach `docs/schemas/planer.json`, Datei `docs/autonomy/laeufe/<ISSUE-ID>.json`. Prüfen: `npx tsx scripts/autonomy/schema.ts planer <datei>`. Kein Freitext.

Entscheidung und Vorher/Nachher der Workflow-Läufe: `docs/decisions/SIN-636-ein-planer.md`.

## Bereichs-Spuren (SIN-896)

- Zerlege jedes Vorhaben in getrennte Issues je Bereich (`schnittstelle`, `backend`, `frontend`, `infra`), Label und `worker-pfade` aus `src/lib/loop/bereich.ts` (`planeVorhaben`).
- Brauchen Frontend und Backend denselben Vertrag, kommt zuerst das `schnittstelle`-Issue (Typen, Mock); die anderen hängen per Blocker daran.
- Gemeinsame Dateien nicht anfassen: Proben in `docs/abnahme/<SIN-xxx>.yml`, Lehren in `docs/lehren/<SIN-xxx>.md`. README und AGENTS ändert nur ein eigenes `infra`-Issue.

## Ort und Muster (SIN-1034)

- Jedes Issue für ein neues Feature oder eine neue Seite enthält einen Abschnitt „Ort und Muster“: Route, vorhandene Komponente und 1 bis 3 recherchierte Quellen (Research-Skill, Links mit Datum). Ohne Quellen legst du das Issue nicht an. Grundlage ist das Urteil des Architekten (`docs/skills/architekt/SKILL.md`).

## Echte Entscheidung (SIN-1014)

- Echte Entscheidung (Design, Infrastruktur, Kosten, Zugang, Produkt, Umfang) → Label `entscheidung` mit Block (Frage, 2–3 Optionen, Empfehlung, Recherche vorher), nie Frage im PR-Text. Routinefehler bleiben `needs-human`. Siehe `src/lib/entscheidung/entscheidung.ts`.
