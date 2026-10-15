# SIN-713: Bot Advisor als Rolle

**Link:** Linear [SIN-713](https://linear.app/sinan-kahraman/issue/SIN-713/bot-advisor-meta-agent-der-aus-einem-satz-einen-neuen-agenten-entwirft)

## Entscheidung (15.10., mit Claude)

- Der Bot Advisor ist eine Claude-Rolle (`docs/skills/botadvisor/SKILL.md`), kein Code-Modul und kein Dialog-Frontend. Im Repo liegen nur die Rollen-Datei, die Registry-Zeile in `docs/autonomy/agents.json`, der Takt in `docs/autonomy/rollen.json` und das Schema `docs/schemas/botadvisor.json` mit Fixture.
- Das Dashboard zeigt die Rolle ohne weiteren Code, weil `/api/rollen` und die Team-Seite aus `agents.json` lesen.
- Schlüssel: `agent.secrets` erlaubt laut Schema nur Namen in Großbuchstaben; Werte kommen aus Infisical.
- Der Schema-Prüfer kennt jetzt `minItems`/`maxItems` (Interview höchstens 5 Fragen).

## Ausgelassen

- Der Demo-Agent „Competitor Website Watch“ liegt nur als Entwurf in der Fixture. Ihn als Rolle anzulegen und laufen zu lassen braucht einen echten Lauf des Bot Advisors mit Sinans Antworten (Seitenliste, Ziel); das geschah hier nicht.
- Nicht geprüft: Lauf der Rolle im Chat oder als geplante Aufgabe, Darstellung im Browser.
