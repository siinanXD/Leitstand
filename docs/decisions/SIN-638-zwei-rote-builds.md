# SIN-638: Zwei rote Builds insgesamt

Definition, 19.10.2026 (SIN-834): Der erste rote Build zählt als Fehlversuch 1. Eine gezielte Reparatur (`repair:1`) ist erlaubt. Ist deren Build wieder rot, folgen Stopp, Ursache und Vorschlag zum Zerlegen; kein dritter Worker-Start. Deshalb `MAX_REPARATUR = 1`, nicht 2 oder 3. Alte repair:2/3-Zustände bleiben gestoppt.

Die reine Entscheidung, der aufrufende CLI, Workflow-Kommentar, AGENTS.md und Bauen-Skill verwenden dieselbe Grenze. Der CLI bezieht die Grenze aus der Konstanten statt aus eigenen Zahlen in Kommentaren. Vorhandenes needs-human stoppt weiter sofort. Keine Rechte-, Budget- oder Freigabeänderung.

Regression: aktualisierte Sequenz scheiterte mit vorheriger Runtime (repair:1 erlaubte Runde 2); nach Fix 19/19 Auswahltests grün. Weitere Abnahme: komplette Repo-Prüfungen und bestehende GitHub-CI. Produktionswirkung und das Ziel <20 % rote Läufe über sieben Tage sind damit nicht bewiesen.

Scope: Leitstand. Lern-App verwendet noch ihre bisherige eigene Reparaturlogik; die repoübergreifende Übernahme bleibt ein offener Teil von SIN-638. Wiederholte Workflow-Auslieferungen, Worker-Claims und Wiederaufnahme nach Kontingent-Pausen benötigen separate Belege. Kein Job wurde neu gestartet.
