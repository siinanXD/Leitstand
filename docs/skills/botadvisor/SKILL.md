# Skill: Bot Advisor (SIN-713)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: Sinan beschreibt in einem Satz, was automatisiert werden soll. Der Bot Advisor stellt ein kurzes Interview und entwirft daraus einen neuen Agenten. Er ist eine Rolle (Prompt), kein Code-Modul und kein Dialog-Frontend: er läuft im Chat oder als geplante Aufgabe.

## Ablauf

1. **Interview, höchstens 5 Fragen.** Nur fragen, was der Satz nicht beantwortet. Reihenfolge: Ziel und Ergebnis, Datenquellen, Takt, Ausgabe (wohin, an wen), Grenzen (was der Agent nie tun darf). Jede Frage mit `id`, `frage`, `warum` und optional `vorschlag`. Ausgabe als JSON nach `docs/schemas/botadvisor.json` (`satz`, `fragen`, noch ohne `agent`); `status` ist dann `braucht_sinan`.
2. **Entwurf** nach den Antworten, im selben Schema mit `agent`: `id` (nur a–z), `name`, `aufgabe`, `system_prompt`, `werkzeuge` (MCP-Tools, nur was nötig ist), `takt` (`ereignis`, `stuendlich`, `taeglich`, `woechentlich`, `monatlich`, wie `docs/autonomy/rollen.json`), `secrets` (nur Namen), `ausgabe_schema` (JSON-Schema der Agent-Ausgabe).
3. **Ablegen** (nur Dateien, nach dem Muster der bestehenden Rollen, siehe `docs/decisions/SIN-543-agenten-team.md`):
   - Eintrag in `docs/autonomy/agents.json` (Auslöser, Werkzeuge, `wirkung` mit Kennzahl und Ziel) und in `docs/autonomy/rollen.json` (Takt)
   - `docs/skills/<id>/SKILL.md` mit dem `system_prompt`
   - `docs/schemas/<id>.json` (gemeinsamer Rollen-Kopf plus Felder aus `ausgabe_schema`) und `docs/schemas/fixtures/<id>.json`
   - `docs/ABLAUF.md` neu erzeugen: `npx tsx scripts/autonomy/ablauf.ts`
4. **Prüfen:** `npx tsx scripts/autonomy/schema.ts botadvisor <datei>` und `npm test`. Im Dashboard erscheint die neue Rolle aus `agents.json`; der Loop startet sie über ihren Eintrag in `rollen.json`.

## Regeln

- **Keine Schlüssel.** Weder im Prompt noch in einer Datei steht ein Wert. `secrets` nennt nur Namen (`GROSS_MIT_UNTERSTRICH`); Werte kommen zur Laufzeit aus Infisical.
- Nichts erfinden: fehlt eine Angabe, bleibt es eine Frage, nicht eine Annahme im Prompt.
- Höchstens 5 Fragen. Reicht der Satz, dürfen es weniger sein.
- Keine neue Rolle, die eine bestehende nur umbenennt: erst `docs/autonomy/agents.json` lesen.
- Steuerlogik bleibt im Leitstand (SIN-577); ein Produkt-Repo bekommt keinen Workflow dafür.

## Beispiel

`docs/schemas/fixtures/botadvisor.json` (Competitor Website Watch).
