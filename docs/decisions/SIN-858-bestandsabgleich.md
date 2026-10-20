# SIN-858: Bestandsabgleich 1/3, Evidenz sammeln

Teil von SIN-857. Lesender Sammler, noch keine Planer-/Fertig-Entscheidung, keine neue Datenbank oder Modell-API.

## Quellen gezielt lesen

`npx tsx scripts/bestand/bestand.ts leitstand <bereich> <feature> [begriff …]`

- Gedächtnis: Vault-Commit zuerst auflösen; index.md und Produktnotiz an genau diesem Stand lesen. Nur passende Katalog-/Entscheidungslinks nachladen. Kein kompletter Vault-Download.
- Code: versionierte Textdateien im lokalen Git-Commit lesen, in Pfad **und Inhalt** suchen; Tests unter src/tests/e2e sowie Infrastruktur unter .github/workflows und Skripte in TS/JS einschließlich mjs/cjs/mts/cts, Shell und YAML werden mitgelesen. Links zeigen auf die Commit-SHA. Inhaltshashes belegen die gelesenen Inhalte, keine Rohtexte verlassen den Leser.
- Linear: gezielt nach Begriffen in Titel/Beschreibung innerhalb des Produkts suchen, alle Zustände zulassen. Kleine Cursor-Seiten vollständig lesen; ungültige/wiederholte Cursor sind Fehler.
- PRs: GitHub-Suche nach Begriffen in Titel/Beschreibung statt alle PR-Payloads zu laden; sämtliche Suchseiten lesen, Treffer deduplizieren, nur diese PRs samt vollem Head-SHA lesen. Unvollständige Suchergebnisse und das 1000-Treffer-Limit ergeben einen Quellfehler, nie ein scheinbar vollständiges Inventar.

`produkt` ist derzeit ausdrücklich auf den vorhandenen Leitstand-Checkout begrenzt. Andere Produkte benötigen ihren eigenen Checkout/Adapter; es wird kein falscher Produktbestand behauptet. Jeder Bereich bleibt ein eigener Bericht (`sammleAlle`).

## Vertrag und Datenschutz

`produkt, bereich, feature, quellen, vorhandene_bausteine, offene_arbeit, fehlende_nachweise, quellfehler`.
Quellen tragen ref/SHA/Fehlerstatus, einzelne PRs ihren Head. Linear hat keine SHA. Rohinhalte werden nur im Arbeitsspeicher zum Suchen verwendet. Berichte enthalten Pfade/Titel, Links, Zustände und Inhaltshashes. Nur diese ausgehenden Metadaten werden auf Geheimnisse geprüft. Rohfehler werden nicht gespeichert; eine defekte Quelle verhindert Aussagen zu ihr, die übrigen bleiben auswertbar.

Ausgabe: `docs/bestand/<produkt>-<bereich>.json`, mit Modus 0600. Automatische Berichte sind gitignoriert; kein privater Inventarnachweis wird ohne ausdrückliche Veröffentlichungsfreigabe versioniert. Bereichsnamen erlauben keine Pfadtraversierung. Bei Quellfehlern liefert ein echter Lauf Exit-Code 1. Suchbegriffe sind Pflicht, mindestens vier Zeichen.

## Unabhängige Abnahme

`DRY_RUN=1 npx tsx scripts/bestand/probe.ts` startet den echten CLI-Prozess: einmal mit externer Quellen-Fixture und echtem lokalen Git, einmal mit fehlenden externen Quellen. Es prüft den JSON-Vertrag, Testfunde mit Inhaltshash, offene Arbeit, Geheimhaltung der Rohtexte und die drei erwarteten Quellfehler. Die Probe läuft in build-CI; die HTTP-Probe `leitstand-bestand-ci` registriert erfolgreiche main-CI an der aktuellen `${GITHUB_SHA}`. Fehlende SHA oder fehlender Lauf bleibt rot; alte main-Läufe zählen nicht. Sie ist ausdrücklich **kein** Live-Netz-Inventar.

## Live-Inventar bleibt offen

Ein verlinkter, für die Veröffentlichung freigegebener echter Inventarnachweis fehlt noch. Private Connector-Daten bleiben lokal und werden nicht ins Repository übertragen. Der generische `BESTAND_CONNECTOR_INPUT`-Adapter kann einen gezielten Einzel-Snapshot lesen; er ersetzt keinen vollständigen Live-API-Lauf.

Die HTTP-Transportwege, Index-Linkauflösung und echte mehrseitige API-Antworten sind noch nicht live geprüft. Fixture-/Paginationtests ersetzen diese Aktivierungsprüfung nicht. Kein Done vor grüner Live-Probe.

## Schreibscope / Grenzen

Geändert: Sammler/CLI, CLI-Probe und Fixture, Unit-Tests, build-Trockenlauf, bestehende Abnahme-Liste und Dokumentation/Ausgabe-Ignorierung. Keine Rechte/Secrets/Migrationen; die geteilte Abnahme-Engine bleibt unverändert. Wortvergleich statt semantischer Suche; Testfunde bedeuten vorhandenen Testcode, nicht bestandene Laufzeit-Abnahme.

## Review-Nacharbeit 20.10.2026

Der unabhängige Review https://github.com/siinanXD/Leitstand/pull/308#issuecomment-6277554382 benennt fehlende direkte Transport-Nachweise und zu breite Einzeldatei-Lektüre. Code-Lader nutzt jetzt eine wortbezogene Git-Inhaltssuche im gepinnten Commit plus passende Dateinamen. Nur passende Dateien werden mit git show geladen und gehasht; der Git-Index wird weiter für Pfade verwendet. Es entsteht keine Volltextkopie aller Quelldateien im Collector.

`src/lib/bestand/cli.test.ts` startet den echten Collector mit lokalen API-Fixtures und echtem Git: Linear after=null,c1,c2; GitHub-Seiten 1/2 mit 101 PRs; wiederholter und fehlender Cursor; incomplete_results und Suchlimit über 1000. Jeder unvollständige Transport wird als Quellfehler ohne erfolgreiche Teilmenge berichtet. Ein Spy verbietet das Einzellesen einer unpassenden Datei und prüft Treffer allein über Inhalt sowie allein über Dateiname. Die Fixture ersetzt keine echte externe Live-Abnahme.

Zweiter Review findet einen Secret-Wert im freien Anfragefeld als möglichen Berichtinhalt. Der bestehende Detektor mitGeheimnis prüft jetzt die gesamte Anfrage vor jedem Quellenzugriff. Unit-Probe prüft alle Anfragefelder; tatsächliche CLI mit Secret im Feature muss Exit 1 liefern, darf keine JSON-Datei schreiben und den Wert nicht loggen. Grenzen des bestehenden Muster-Detektors bleiben unverändert; unbekannte Secret-Formate sind keine garantierte DLP-Erkennung.
