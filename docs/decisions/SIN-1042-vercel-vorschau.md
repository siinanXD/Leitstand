# SIN-1042: Vorschau-Builds nur bei UI-Änderungen

Am 23.10.2026 lehnte Vercel Deployments ab (Tageslimit 100, Code `api-deployments-free-per-day`). Jeder Push auf einen `claude/`-Branch baute eine Vorschau, auch bei reinen Doku-, Workflow- und Skript-Änderungen.

## Regel

`vercel.json` setzt `ignoreCommand: node scripts/vercel-ignore.mjs` (Ignored Build Step; Exit 0 = überspringen, 1 = bauen). Gebaut wird bei `main`/Produktion immer, sonst nur, wenn der letzte Commit `src/app/**`, `src/components/**`, `public/**`, `package*.json`, `next.config.*` oder `*.css` berührt. Ist der Diff nicht lesbar, wird gebaut. Logik `sollBauen` mit Tests in `src/lib/vercel/vorschau.test.ts`.

## Grenzen

- Geprüft wird nur der letzte Commit (flacher Vercel-Klon). Ein Merge von main in den Branch kann dadurch eine Vorschau bauen.
- Der Befehl läuft vor `npm ci`, deshalb reines Node ohne Abhängigkeiten.

## Zählung

Deployments der letzten 24 h: vorher mindestens 100 (Limit erreicht). Nachher: nach Aktivierung aus den GitHub-Statusmeldungen „Vercel“ nachtragen.

## Offen

Gleiches für die Lern-App als Folge-Issue (eigenes Repo).
