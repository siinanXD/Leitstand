# SIN-543: Agenten-Team neu aufstellen

**Link:** Linear [SIN-543](https://linear.app/sinan-kahraman/issue/SIN-543/ceo-35-agenten-team-neu-aufstellen-9-rollen-als-skills-3-spuren-zum)

## Entscheidung

- `docs/autonomy/agents.json` ist die einzige Quelle für Rollen, Auslöser (`ausloeser[]`), Sicherheitsnetz (`netz`), Werkzeuge und Spuren. Zehn Einträge: die neun Rollen des Issues plus Gedächtnis als Pflege-Lauf. Jede Rolle zeigt auf `docs/skills/<rolle>/SKILL.md`.
- `docs/schemas/<rolle>.json` (zehn Stück, `additionalProperties: false`, gemeinsamer Kopf) mit je einer Fixture unter `docs/schemas/fixtures/`. Prüfer: `src/lib/autonomy/schema.ts`, Aufruf `npx tsx scripts/autonomy/schema.ts <rolle> <datei>`. Der Issue nennt `.mjs` und Ajv; Ajv ist keine direkte Abhängigkeit, und das Repo schreibt Skripte in TypeScript. Deshalb ein eigener Minimal-Prüfer (Grenze im Dateikopf).
- `docs/ABLAUF.md` entsteht aus `agents.json` (`npx tsx scripts/autonomy/ablauf.ts`). Der Test `autonomy.test.ts` schlägt in `npm test` (und damit in `build`) an, wenn die Datei nicht passt.
- Research: `npx tsx scripts/autonomy/research.ts <ISSUE-ID> "<Suchwort>"` fragt die öffentliche Hugging-Face-Hub-API (ohne Token) und die GitHub-Suche ab und schreibt `docs/decisions/<ISSUE-ID>-research.md`. Ohne GitHub- und HF-Treffer wird nichts geschrieben. Getestet mit Fixture-Antworten, nicht gegen das Netz.

## Bewusst offen (eigene Schritte)

- Workflows der Lern-App (27 auf höchstens 15, Liste vorher/nachher): liegt in einem anderen Repo.
- Ereignis-Trigger (`workflow_run`/`pull_request`), Zähler `merges_seit_hausmeister` in `loop_snapshot`, `rolle_gestartet`-Ereignis, `protokoll.mjs`: ändern `.github/workflows/` (Sinan) und die Datenbank.
- `/ablauf` mit Rollen-Figuren aus `agents.json` und die Seite „Mein Team“: warten auf die Figma-Frames aus SIN-545. Die bestehende `src/data/agents.json` (Ablauf nach Agent) bleibt unverändert, bis die Seite umgestellt wird.
- `figma-abdeckung.mjs`, CI-Warnung für Figma und Structured Outputs der API-Aufrufe (`STRUCTURED_OUTPUTS=1`).
