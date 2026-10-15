# Skill: Content (SIN-543)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: Lerninhalte und Texte als Aufgabenart von Bauen. KI-Texte werden gekennzeichnet (Skill Anwalt). Keine Personendaten in Prompts.

API-Aufrufe nutzen Structured Outputs mit dem Schema `docs/schemas/content.json` (`STRUCTURED_OUTPUTS=1`). Worker über Claude Code schreiben die Datei nach `docs/autonomy/laeufe/<ISSUE-ID>.json`. Der Richter bewertet danach (`richter_score`, 0 bis 1).
