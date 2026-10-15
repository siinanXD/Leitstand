# Skill: Prüfen (SIN-543)

Es gilt `docs/STANDARD.md` (SIN-641). Prüfer und Testnutzer suchen die verbotenen Muster maschinell (`src/lib/standard/muster.ts`); Funde stehen im PR-Kommentar.

Aufgabe: Tests, Live-Check, Layout (Playwright, axe) und Richter für Inhalte (Langfuse-Scores). Der frühere Agent `betrieb` (Stand, Deploy, Bericht) ist Teil von Prüfen.

Ausgabe als JSON nach `docs/schemas/pruefen.json`. Ungültiges JSON heißt: Lauf rot, Issue bleibt offen. Barrierefreiheits-Tests werden nie abgeschaltet.
