# SIN-858: Bestandsabgleich 1/3, Evidenz sammeln

Teil von SIN-857. Lesender Sammler, noch keine Planer-/Fertig-Entscheidung, keine neue Datenbank oder Modell-API.

## Quellen gezielt lesen

`npx tsx scripts/bestand/bestand.ts leitstand <bereich> <feature> [begriff …]`

- Gedächtnis: Vault-Commit zuerst auflösen; index.md und Produktnotiz an genau diesem Stand lesen. Nur passende Katalog-/Entscheidungslinks nachladen. Kein kompletter Vault-Download.
- Code: versionierte Textdateien im lokalen Git-Commit lesen, in Pfad **und Inhalt** suchen; Tests unter src/tests/e2e werden mitgelesen. Links zeigen auf die Commit-SHA. Inhaltshashes belegen die gelesenen Inhalte, keine Rohtexte verlassen den Leser.
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
