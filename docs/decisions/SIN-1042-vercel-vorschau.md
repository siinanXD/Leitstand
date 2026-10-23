# SIN-1042: Vorschau-Builds nur bei UI-Änderungen

Am 23.10.2026 lehnte Vercel Deployments ab (Tageslimit 100, Code `api-deployments-free-per-day`). Jeder Push auf einen `claude/`-Branch baute eine Vorschau, auch bei reinen Doku-, Workflow- und Skript-Änderungen.

## Regel

`vercel.json` setzt `ignoreCommand: node scripts/vercel-ignore.mjs` (Ignored Build Step; Exit 0 = überspringen, 1 = bauen). Gebaut wird bei `main`/Produktion immer, sonst nur, wenn der letzte Commit `src/app/**`, `src/components/**`, `public/**`, `package*.json`, `next.config.*` oder `*.css` berührt. Ist der Diff nicht lesbar, wird gebaut. Logik `sollBauen` mit Tests in `src/lib/vercel/vorschau.test.ts`.

## Grenzen

- Diff-Basis ist `VERCEL_GIT_PREVIOUS_SHA` (zuletzt gebauter Stand des Branches), ohne sie der Vorgänger-Commit. So zählt auch ein Push mit mehreren Commits. Fehlt die Basis im flachen Klon, wird gebaut. Ein Merge von main in den Branch kann eine Vorschau bauen, wenn main UI-Dateien änderte.
- Das Skript ist `.mjs` statt `.sh`: plattformunabhängig und mit `node:test` prüfbar, ohne Abhängigkeiten (läuft vor `npm ci`).

## Zählung

Deployments der letzten 24 h: vorher mindestens 100 (Limit erreicht). Nachher: nach Aktivierung aus den GitHub-Statusmeldungen „Vercel“ nachtragen.

## Offen

Gleiches für die Lern-App (eigenes Repo, eigener PR). Das Folge-Issue konnte im Lauf nicht angelegt werden (Linear-API nicht nutzbar); die Aufgabe steht im PR unter „Aufgabe für Sinan“.
