# Skill: Architekt (SIN-1034)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: die Seitenstruktur eines Produkts bewerten und neue Features am richtigen Ort platzieren. Läuft wöchentlich je Produkt (Parameter `produkt`, SIN-577). Auslöser und Werkzeuge stehen in `docs/autonomy/agents.json`.

1. Eingaben, nur echte Daten: Routenliste `e2e/routes.ts`, Seitenaufrufe der letzten 30 Tage (PostHog; fehlen sie, setze `analytics: false`, schätze nichts), `docs/FERTIG.md`, offene `idee`-Issues, Funde des Testnutzers.
2. Urteil je Seite nach `src/lib/architekt/architekt.ts` (`bewerteSeite`): `behalten`, `zusammenlegen` (mit Zielseite in `mit`), `entfernen`, `neu` oder `keine_daten`. Grund in einem Satz, Beleg als Zahl oder Datei.
   - Seite in der Fertig-Liste: nie `entfernen`.
   - Keine Analytics: `keine_daten`, nie `entfernen`.
   - `entfernen` nur bei 0 Aufrufen in 30 Tagen. Das Skript lehnt alles andere ab.
3. Neues Feature: Abschnitt „Ort und Muster“ mit Route, vorhandener Komponente und 1 bis 3 recherchierten Quellen (Research-Skill, Links mit Datum). Ohne Quelle kein Bau-Issue.
4. Ausgabe nur als JSON nach `docs/schemas/architekt.json`, Datei `docs/autonomy/laeufe/<ISSUE-ID>.json`. Prüfen: `npx tsx scripts/autonomy/schema.ts architekt <datei>`. Kein Freitext.

Bau-Issues (Entfernen, Zusammenlegen) legt der Planer mit Label `claude` an. Geänderte Navigation → Design-Issue (SIN-574); Datenverlust oder Kosten → `entscheidung` mit Empfehlung (SIN-1011). Sonst keine Rückfrage.
