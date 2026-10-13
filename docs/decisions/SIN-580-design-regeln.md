# SIN-580: Abnahme nach dem Bauen, Vercel-Design-Regeln

## Entscheidung

- **Regeln:** [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) → `web-design-guidelines`, Lizenz MIT. Als Verweis im Skill `docs/skills/designer/SKILL.md` (Abschnitt „Abnahme nach dem Bauen“), nicht kopiert; so bleibt sie aktuell.
- **Tests:** `e2e/abnahme.spec.ts` in Playwright gegen Fixture-Daten, bei 390×844 und 1280×800, in `build` über `npm run test:a11y`.
- **Lighthouse:** [GoogleChrome/lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci) (Apache 2.0), Konfiguration `lighthouserc.json`, Aufruf `npm run lighthouse` über `npx` (keine neue Abhängigkeit im Lockfile).
- Nicht genommen: Storybook/Chromatic (eigener Dienst, zu schwer für sechs Seiten).

## Abweichungen vom Issue

- Reiter heißen im Code Start, Team, Werkzeuge, **Produkt**, Kosten (Issue: „Produkte“).
- Aufgabe: Es gibt keinen Link „‹ Lern-App“ und keinen Abschnitt „Für Technik“; geprüft werden der Link „Start“ und der eingeklappte Abschnitt „Details“, in dem die Kennung steht.
- Die Karte „Was ist kaputt?“ ist nicht gebaut.

## Bewusst ausgelassen / Sinans Schritt

- `abnahme.yml` (Schritt D) und das Lighthouse-Gate in `build.yml`: Der Worker darf `.github/workflows/` nicht ändern. Vorgesehen: `build.yml` ruft `npm run lighthouse` nach `npm run build` auf; `abnahme.yml` läuft bei `deployment_status` = success mit `PLAYWRIGHT_BASE_URL`, schreibt `loop_events` mit `payload.art = "abnahme"` und legt bei Rot ein Linear-Issue mit Label `kaputt` an.
- Lighthouse misst vorerst nur `/anmelden`: Die Menü-Seiten brauchen eine Sitzung, dafür fehlt ein Puppeteer-Skript mit Fixture-Sitzung. shortcut: eine Seite, mit `puppeteerScript` ausbauen.
- Kein Bildvergleich (Visual Regression), wie im Issue.
- Playwright wurde in diesem Lauf nicht ausgeführt (Vorgabe: kein Playwright); `e2e/abnahme.spec.ts` läuft zum ersten Mal in `build`. Der absichtlich kaputte Reiter mit Nachweis-Bild steht aus.
