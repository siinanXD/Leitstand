# SIN-615: Entscheidungsnotizen sind Historie

Befund am 19.10.2026 (Europe/Berlin), Basis 824025b: `entscheidungSeite` erzeugte Links aus Produkt-IDs (`leitstand`, `lernapp`), die tatsächlichen Seiten heißen `Leitstand` und `Lern-App`. `abschliessen` ersetzte bestehende Entscheidungsnotizen bei jedem Lauf; dadurch konnten `status: ersetzt`, das ursprüngliche Datum und Ergänzungen verschwinden.

Kleinste Reparatur: Produktnamen aus derselben Eingabe wie die Produktseiten verwenden. Bei unbekanntem Produkt keinen erfundenen Link erzeugen. Bestehende Entscheidungsnotizen vollständig erhalten; ausschließlich den alten maschinell erzeugten ID-Produktlink auf den bekannten Namen korrigieren. Neue Entscheidungsdateien werden weiter angelegt. Bewusste Entscheidungsänderungen erhalten eine eigene Nachfolgenotiz mit Quelle und Ersetzt-Verweis; sie sind kein Tages-Snapshot.

Nachweis: zwei neue Regressionstests scheiterten vor der Änderung und bestehen danach. Ein Test lässt den bestehenden Linkprüfer die erzeugten Dateien prüfen; der andere schützt Datum, ersetzten Status und historische Ergänzung und prüft den Neueingang. Typecheck, Lint und 475 Tests erfolgreich. Keine neue Abhängigkeit, kein Modellaufruf, keine Änderung an Workflow, Rechten oder Geheimnisprüfung.

Grenzen: Dies ist keine Live-Abnahme des Schreib-Workflows. Automatische semantische Widerspruchslösung, vollständige Ereignisabdeckung und das wiederholte Anhängen von Wochenberichten bleiben gesonderte offene Befunde in SIN-541/SIN-615. Keine fachliche Entscheidung automatisch überschreiben.
