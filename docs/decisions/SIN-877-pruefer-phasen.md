# SIN-877: Nur ausdrücklich spätere Nachweise zurückstellen

Der Prüfer klassifiziert Funde als `codefehler`, `sicherheit` oder `nachweis` und nennt den betroffenen Auftragshaken. Beide Provider erhalten dasselbe strikte Antwortschema. Alte Antworten ohne Klassifikation bleiben konservativ: keine automatische Herabstufung.

`bewerte` stuft einen hohen Fund nur dann auf mittel, wenn er ausschließlich als fehlender Nachweis klassifiziert ist und sein Haken mit einer ausdrücklich `[nach Aktivierung]` markierten Checkbox des aktuellen Auftrags übereinstimmt. Linear-Escaping wird berücksichtigt. Fehlende, unbekannte oder widersprüchliche Zuordnungen reichen nicht. Dateipfade, Zeilennummern und Stichwörter im Befund entscheiden nicht über die Phase. Code- und Sicherheitsfunde bleiben hoch-fähig.

Ein `bestanden=false` wird nur aufgehoben, wenn sämtliche Modellfunde solche späteren Nachweise sind und mindestens einer hoch war. Unbegründete Ablehnungen bleiben gesperrt. Unmarkierte Pflichtbelege und fehlende Abnahme-Proben erzeugen weiterhin hohe Funde. Spätere Haken bleiben unbelegt und verhindern Done; Owner-Freigabe und Reparaturgrenzen bleiben bestehen.

`src/lib/pruefer/fixtures/review-302.json` und `review-308.json` enthalten unveränderte veröffentlichte Review-Kommentare mit Herkunft und geprüftem Commit, keine vorgetäuschten API-Rohantworten. Das #308-Original für `e7f3dfa` stammt aus dem archivierten Job-Log, weil der Bot seinen Kommentar später überschrieben hat. Tests spielen die alten Funde konservativ durch und prüfen separat eine ausdrücklich klassifizierte Variante des reinen Live-Nachweis-Fundes von #302. Die alten Umfangs-/Code-Funde und der unmarkierte Pagination-Test aus #308 bleiben blockierend; sie werden nicht rückwirkend wegklassifiziert.

Abnahme: neun Regressionstests in `phase.test.ts`, bestehende Prüfer-/Transporttests, Installationsprobe und Head-gebundene CI-Probe. Der Prüfer läuft aus main; dieser PR aktiviert seinen eigenen Fix nicht. Nach Sinans Merge bleibt ein frischer Live-Review auf #302 separat nachzuweisen.

Die unabhängige Review-Runde auf `ed361c6` beanstandete eine fehlende Rückversicherung gegen falsch als Nachweis klassifizierte Sicherheitsfunde. Ein zusätzlicher konservativer Sicherheitsfilter prüft Text, Haken und Dateipfad und verhindert die Herabstufung bei Sicherheitsindikatoren, auch bei `art=nachweis`. Ein Negativtest mit elf Fällen für Secrets, Tokens, Passwort, Credentials, Rechte, Datenverlust, DROP, Service-Role, Injection und Zugang war vor dem Fix rot. Dieser Filter kann im Zweifel eine manuelle Prüfung verlangen; er ersetzt keine semantische Sicherheitsprüfung und erweitert niemals die erlaubten Herabstufungen.

Ausgelassen: keine weiteren Provider, Secrets, Rechte oder automatischen Freigaben; kein erfundener Live-Nachweis.
