# SIN-856: Zwei unabhängige Bau-Worker und lesender Subagent

Sinan hat am 19.10.2026 um 22:46 Europe/Berlin Prüfung und Änderung beauftragt.

## Befund und Entscheidung

`dispatch.yml`, `loop-merge.yml`, `waechter.yml` und die Skripte hatten Standard 1; die globale Variable gilt auch für Produkt-Repos. Dauerhafte Claims sichern ein Issue, nicht gemeinsame Dateien verschiedener Issues. Vorarbeiter kennt Pfadüberschneidungen, aber der tatsächliche Dispatcher hat sie bisher nicht geprüft.

Leitstand bekommt deshalb eine eigene Grenze (Standard/Maximum 2, 1 als Rückfall), andere Produkte behalten ihre Einstellung. Der Dispatcher prüft explizite Schreibpfade aus Linear gegen laufende Issues, wartende offene PRs und die eigene Auswahl. Ohne vollständige Angabe bleibt der Scope exklusiv. Die vorhandene Pfadüberschneidung aus dem Vorarbeiter wird wiederverwendet. Steuerungsdateien bilden zusätzlich eine gemeinsame Konfliktgruppe. Es handelt sich um eine Planungsgrenze, keine Sandbox gegen nicht deklarierte Änderungen.

Ein lesender `lese-assistent` (Read/Grep/Glob, Modell inherit, 12 Turns) wird im vorhandenen Claude-Workflow konfiguriert. Parallelgrenze 1, Tiefe 1; kein zusätzlicher Anbieter, keine Haiku/API-Spur. Hauptworker implementiert; unabhängige Abnahme bleibt separat. Delegation nur, wenn eine konkrete lesende Teilfrage den zusätzlichen Lauf rechtfertigt.

Quelle für CLI-Definition, tools, maxTurns und Grenzen: https://code.claude.com/docs/en/sub-agents (am 19.10.2026 gelesen). Der konfigurierte Hauptworker muss die CLI-Flags/Umgebungsvariablen unterstützen; das wird nicht allein aus der Datei als live belegt behauptet.

## Abnahme und Grenzen

Tests: getrennte Pfade, Datei-/Verzeichnisüberschneidung, gemeinsames Gate, unbekannter/ungültiger Scope, wartender PR, Leitstand-Limit und unveränderte Produktlimits. CLI-Konfiguration separat auf lesende Tools und Grenzen geprüft.

Offen: tatsächlicher Actions-Variablenwert, zwei echte parallele Issue-Läufe und ein protokollierter Subagent-Aufruf. Bestehende Issues ohne Scope-Marker werden nicht automatisch umgeschrieben und laufen weiter einzeln. Mehr Worker erhöhen das verfügbare Claude-Kontingent nicht. SIN-856 bleibt bis zum Live-Nachweis offen.

## Reparatur der Review-Blocker, 20.10.2026

Offene PRs werden unabhängig von Linear-Kennungen über die paginierte GitHub-Dateiliste geprüft, einschließlich alter Namen bei Umbenennungen. Lesefehler, leere Listen und die GitHub-Grenze von 3000 Dateien sperren konservativ. Dauerhafte Claims werden gegen alle geladenen Leitstand-Issues geprüft.

Der echte Dispatch-CLI durchläuft acht isolierte Netz-Fixtures: zwei getrennte Starts, Überschneidung, ein/zwei bestehende Claims, unbekannter Claim-Scope, unzugeordneter PR, zweite Dateiseite und Lesefehler. Die Fixture fing vor dem Fix den fehlenden Start bei unabhängiger PR-Prüfung ab. CI und stündliche Abnahme erzeugen den Bericht frisch unter `/tmp`; er belegt Simulation, keinen Live-Worker oder Subagent-Aufruf.
