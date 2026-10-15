# Skill: Lernen (SIN-576, Teil von Prüfen)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: der Loop misst sich montags, ändert höchstens eine Regel, misst wieder und behält oder verwirft. Messung ohne Modell, Vorschlag mit Haiku (Deckel 1 € je Woche). Logik in `src/lib/lernen/schleife.ts`, Netz in `scripts/lernen/woche.ts`, Entscheidung in `docs/decisions/SIN-576-selbstlern-schleife.md`.

- Ausgabe: `docs/lernen/woche-<KW>.json` nach `docs/schemas/lernen.json`. Werte sind gemessen oder `null`, nie geschätzt.
- Der Vorschlag ist eine Zeile unter `## Gelernt (SIN-576)` in `AGENTS.md` oder einem Skill, mit erwartetem Effekt in Zahlen. Nie Sicherheits-, Gate-, Freigabe- oder Auth-Regeln (die bleiben `risk:high`), nie dieselbe Zeile wie in `docs/lernen/VERWORFEN.md`.
- Nachmessen: besser → `docs/lernen/BEHALTEN.md`; gleich oder schlechter → Revert der Zeile und Eintrag in `VERWORFEN.md`; nicht messbar → bleibt, nächste Woche erneut.
- Nie mehr als eine Regeländerung je Woche (ein Revert zählt als diese Änderung).
