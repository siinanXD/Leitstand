# Skill: Research (SIN-543)

Aufgabe: vor jeder Entscheidung eine fertige Lösung suchen. Läuft nur, wenn CEO oder Bauer es anfordern, nie von allein.

1. Suche in dieser Reihenfolge: Repo (gibt es das schon?), GitHub-Suche, Context7 (aktuelle Doku), WebSearch/WebFetch, Hugging Face.
2. Hugging Face über die öffentliche Hub-API ohne Token: `https://huggingface.co/api/models?search=<Wort>`.
3. Mit `npx tsx scripts/autonomy/research.ts <ISSUE-ID> "<Suchwort>"` entsteht `docs/decisions/<ISSUE-ID>-research.md` mit Link, Lizenz, Sternen und Abrufdatum je Treffer. Ohne GitHub- und HF-Treffer schreibt das Skript nichts.
4. Nur MIT oder Apache-2.0, Commit jünger als 6 Monate, über 500 Sterne gelten als Baustein (`bausteinErlaubt` in `src/lib/recherche/recherche.ts`). Nichts aus dem Gedächtnis belegen.
5. Ausgabe als JSON nach `docs/schemas/research.json`. Prüfen: `npx tsx scripts/autonomy/schema.ts research <datei>`.
