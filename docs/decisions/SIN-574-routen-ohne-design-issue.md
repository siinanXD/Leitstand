# SIN-574: Routen ohne Design-Issue, Trockenlauf für Skripte

## Entscheidung

- Neue Route/Seite nur aus vorhandenen Komponenten und Tokens braucht kein Design-Issue mehr (Beleg: Nachweis-Bilder, SIN-561). Neue Komponente, neue Farbe/Token oder geänderte Navigation brauchen weiter eins. Engpass war SIN-239: Figma ist nur im Chat beschreibbar.
- Jede solche Route steht in `docs/design/OFFEN-FIGMA.md` (Route, Datum, PR) und wird wöchentlich nachgezogen.
- Prüfer-Regel: neue Skripte unter `scripts/` laufen einmal mit `DRY_RUN=1` in CI (4 Agenten-Skripte liefen vorher nie: Top-Level-await, falsche Spalten).

## Bewusst ausgelassen

- Der Trockenlauf-Schritt in `.github/workflows/build.yml`: Der Worker darf Workflows nicht ändern. Das ist Sinans Schritt (z. B. `git diff --name-only origin/main -- 'scripts/**/*.ts'` und je Datei `DRY_RUN=1 npx tsx <Datei>`).
- 14-Tage-Meldung im Hausmeister (SIN-551) und `AGENTS.md` der Lern-App (anderes Repo).
