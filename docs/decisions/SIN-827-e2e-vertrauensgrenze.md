# SIN-827: E2E-Live-Collector nur vom Hauptbranch

Sicherheitsfix, siehe Linear SIN-827 und Audit SIN-1088.

Der Live-Workflow behält Schedule und den manuellen Start, erlaubt aber nur main. PRs lösen ihn nicht mehr aus. Checkout-Credentials werden nicht gespeichert; npm-Lifecycle-Skripte laufen nicht. Die vorhandene build-CI prüft die synthetischen E2E-Tests ohne Produktionssecrets. Ein echter Collector-Trockenlauf mit Live-Daten bleibt nur vom Hauptbranch möglich und ersetzt keinen Fixtures-Test.

Alternative wäre ein privilegierter PR-Prüfworkflow vom Basisstand wie beim zentralen Prüfer. Für diesen Collector ist er unnötig: PR-Test und Live-Messung benötigen keinen gemeinsamen Workflow. Es entsteht kein neuer Trigger, Dienst oder Berechtigungsumfang.

Regression: kein PR-Auslöser, Hauptbranch-/Ereignis-Sperre und keine persistierten Credentials oder Install-Skripte. Die Datei-Probe belegt nur Installation; echte negative und positive Workflow-Abnahme bleibt nach Aktivierung offen. Geschützte Reviews von Workflowänderungen bleiben erforderlich; der Patch ändert weder Rulesets noch Secrets.

Die Gegenprobe läuft als fester build-Schritt, weil die selektive TypeScript-Importanalyse keine readFileSync-Abhängigkeit von Workflow-YAML erkennt. Damit bleibt die Grenze auch bei einem späteren reinen Workflow-Diff geprüft.
