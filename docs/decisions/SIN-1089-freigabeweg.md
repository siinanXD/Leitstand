# SIN-1089: Freigabe durch das gemeinsame Merge-Gate

Sicherheitsfix, siehe Linear SIN-1089 und Audit SIN-1088.

Die Freigabe-API setzt in beiden erlaubten Repositories nur das Label `freigegeben`. Im Leitstand gilt ein einziger synchroner, SHA-gebundener Mergeweg fuer alle Branches. Vor dem Merge werden Head, Zielbranch samt Basis-SHA, eigenes Repository, Build, Draft und Sperrlabels erneut geprueft. Ausstehendes Auto-Merge wird bei der Neubewertung fuer alle Branches deaktiviert.

PRs mit Worker-Branch oder SIN-Kennung im Titel brauchen aktuelle Belege fuer den Head und den Linear-Auftragsstand. Ohne Linear-Zuordnung setzt das Gate ausdruecklich `risk:high` und verlangt `freigegeben`. Die Merge-Policy des anderen erlaubten Repositorys bleibt dessen eigenem Workflow vorbehalten.

Ein zweiter Policy-Nachbau in der API wird vermieden. Kein neues Recht, Secret, Dienst oder Ausloeser. Die Antwort der API bestaetigt die Freigabe, keinen abgeschlossenen Merge.

Regressionen pruefen den Route-Aufruf mit Agent-Testkonto (403 ohne GitHub-Aufruf), Headwechsel waehrend der Pruefung, Zielwechsel, fehlende Workflow-Belege und den Freigabeweg ohne Linear-Issue. Zwei Dateiproben verlangen den Label-Aufruf und verbieten Merge-Aufrufe. Diese lokalen Belege ersetzen keine Live-Abnahme nach Aktivierung; SIN-1089 bleibt bis dahin offen.
