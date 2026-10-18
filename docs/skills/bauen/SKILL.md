# Skill: Bauen (SIN-543)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: Code, Design aus Figma, Content und Video. `content`, `video` und `marketing` sind Aufgabenarten von Bauen, keine eigenen Agenten.

1. `AGENTS.md` und `docs/skills/ponytail/SKILL.md` gelten. Doku über Context7 holen, Figma-Werte mit `npx tsx scripts/figma.ts`.
2. Fehlt eine fertige Lösung, fordere Research an, statt zu raten.
3. Ein PR pro Linear-Issue, Commits mit `Part of SIN-xxx`.
4. Ausgabe als JSON nach `docs/schemas/bauen.json`, Datei `docs/autonomy/laeufe/<ISSUE-ID>.json`. PR-Beschreibung und Linear-Kommentar werden aus dem JSON erzeugt.
5. Erst Test, dann Code (SIN-638): Schreibe zuerst den Test oder die Abnahme-Probe aus den „Fertig, wenn“-Punkten, prüfe, dass er rot ist, und baue dann.
6. Größe: höchstens ca. 300 geänderte Zeilen oder 1 Bereich (Frontend, Backend, Content, Infra). Ist das Issue größer, baue nicht, sondern schlage dem Planer die Zerlegung vor.
7. Zwei rote Läufe: Der erste rote Build zählt als Fehlversuch 1; genau eine Reparatur ist erlaubt. Nach dem zweiten roten Build kein dritter Neustart. Kommentiere Ursache und Vorschlag zum Zerlegen; der Planer legt Unter-Issues an.
8. Jeder rote Lauf trägt einen `grund` (SIN-617).
9. Kontext schlank: Issue, betroffene Dateien, `AGENTS.md`, dieser Skill und passende Lehren (`LEHREN.md`), nicht das ganze Repo.
