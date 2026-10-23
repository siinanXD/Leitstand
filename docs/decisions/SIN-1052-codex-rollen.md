# SIN-1052: begrenzte Codex-Rollen, Claude als Hauptworker

Claude bleibt der Standard für Implementierung und Reparatur. Codex startet nur mit Label `codex` und genau einem Marker `<!-- codex-rolle: review -->`, `planer` oder `content`. Der vorhandene Linear-Delegate ist der unterstützte Startweg; keine neue API, keine Abhängigkeit. Ein expliziter Rollenauftrag statt Titelheuristik verhindert unbeabsichtigte Entwicklungsarbeit. Allgemeines Codex-first-Routing entfällt.

Auch bei pausiertem Claude-Kontingent bleiben Codex-Rollenaufträge möglich; Claude-Starts bleiben gesperrt. Der Dispatcher zählt offene Codex-Delegates projektübergreifend und startet höchstens einen Auftrag. Auch Todo mit gesetztem Delegate belegt diesen Platz. Rollenhinweis und Ergebnisformat stehen vor der Delegation in der Beschreibung. Review und Planung dürfen Produktcode nur lesen; Content entsteht als Entwurf und wird nie automatisch veröffentlicht. Das Ergebnis kommt als dokumentierter PR mit Linear-Kennung zurück; bestehende Gates bleiben erforderlich.

Ein fehlender Branch nach einer Stunde beweist keinen beendeten Agenten. Deshalb erfolgt darauf kein automatischer Workerwechsel. Fehlt die Codex-App bereits vor der Übergabe, wird der noch nicht gestartete Auftrag an Claude zurückgegeben. Nach erfolgreicher oder unklarer Delegation bleibt er gesperrt, bis das tatsächliche Ende geprüft wurde. Eine echte Session-Status-Anbindung ist Voraussetzung für einen weiteren automatischen Wechsel.

Abo-Sitzungen und direkte Modell-APIs sind getrennt. Dieser Patch verwendet keinen Modell-API-Key und ändert keine Abrechnung, Modellnamen oder Budgets. Der bestehende API-Prüfer mit Anthropic-Rückfall bleibt bestehen. Native Codex-Reviews im ChatGPT-Konto sind separat einzurichten und ersetzen dessen headgebundene Nachweise nicht.

Alternativen: Titelheuristik wäre kürzer, verteilt aber unbemerkt Code-Aufgaben. Ein zweiter CLI-/API-Worker würde neue Authentifizierung und Startlogik benötigen. Verwendet wird daher der vorhandene Delegate mit explizitem Rollenvertrag.

Prüfung: Regressionen für Rollen, einen globalen Platz, gesperrte Aufgaben und Timeout ohne Übergabe. Live-Abnahme bleibt in SIN-1052 offen; keine simulierte Ausgabe wird als Abo- oder Kontonachweis gewertet. Quellen: [vorhandener Linear-Weg](../CODEX-WORKER.md), [Codex for Linear](https://learn.chatgpt.com/docs/third-party/linear), [Linear-Delegation](https://linear.app/docs/delegate-issues-to-agents).
