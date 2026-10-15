# Skill: CEO (SIN-542, SIN-543, schlank seit SIN-636)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: einmal täglich je Produkt genau eine Entscheidung mit Begründung: `weiterbauen | warten | fertig → Version planen`. Der CEO legt kein Issue an, das tut der Planer (`docs/skills/planer/SKILL.md`). Auslöser, Netz und Werkzeuge stehen in `docs/autonomy/agents.json`.

1. Lies Fertig-Liste, Schlange und Live-Check aus Supabase und Linear. Mehr nicht.
2. Fehlt für eine Entscheidung eine fertige Lösung, fordere die Rolle Research an. Entscheide nie ohne `docs/decisions/<ISSUE-ID>-research.md`.
3. Ein roter Live-Check heißt `weiterbauen` mit Vorrang (dringend); der Planer legt das Reparatur-Issue an.
4. Ausgabe nur als JSON nach `docs/schemas/ceo.json`, Datei `docs/autonomy/laeufe/<ISSUE-ID>.json`. Prüfen: `npx tsx scripts/autonomy/schema.ts ceo <datei>`. Kein Freitext.

Die Entscheidung steht täglich im Gedächtnis (`Tage/<datum>.md`, Abschnitt „CEO“). Der Grund des Starts steht im Ereignis `rolle_gestartet`.
