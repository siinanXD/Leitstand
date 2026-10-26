# Betrieb: Steuerung, Prüfer und Belege

Betriebsnotizen zum Leitstand, aus dem README ausgelagert (SIN-752). Überblick und Schnellstart: [`README.md`](../README.md). Regeln für Agenten: [`AGENTS.md`](../AGENTS.md).

## Aufbauphase-Probe (SIN-855)

Gate-Integration für die Aufbauphase prüfen: `DRY_RUN=1 node scripts/loop/aufbauphase-probe.mjs`.
Die Probe führt das echte Auto-Merge-Skript mit simuliertem GitHub aus; sie mergt
nichts und ersetzt keinen Live-Nachweis. CI und Abnahme führen sie automatisch aus.

## Linear-Abfragen (SIN-825)

Dispatcher und Planer lesen offene Linear-Projekt-Issues in Seiten zu 25 mit Cursor-Fortsetzung, damit verschachtelte Abfragen unter dem Komplexitätslimit bleiben.

## PR-Prüfer (SIN-827)

Der vorgeschlagene gehärtete Prüfer lädt seine Implementierung und Abhängigkeiten vom Basis-Commit, liest Claude-/Codex-PRs nur als Diff und nennt den geprüften Commit. CLI: `node --import tsx scripts/pruefer/pruefer.ts <PR-Nummer> <Basis-SHA> <Head-SHA>`. Beide SHAs müssen vollständig sein. `DRY_RUN=1` unterdrückt Modell-/Ledger-Aufrufe. Der Prüfer braucht eine eigene API-Konfiguration.

## Claude/Codex-Fallback (SIN-832)

Die vorbereitete [Fallback-Policy](../src/lib/loop/fallback.ts) unterscheidet Kontingent-, Auth-, Netzwerk-, Verbindungs- und fachliche Fehler, begrenzt Wiederholungen und erhält vorhandene PRs und Worker-Claims. `node --import tsx src/lib/loop/fallback.test.ts` führt die isolierten Simulationen ohne Modellaufruf aus.

**Dauerhafte Reservierung (SIN-832):** Vor jedem Start reserviert der Dispatcher das Issue per Compare-and-swap in `leitstand_aufgaben` ([reservierung.ts](../src/lib/loop/reservierung.ts), Spalten `claim_*`, `reparaturen`). Ohne bestätigte Reservierung startet nichts; Merge, Reparaturstopp und ein belegt verwaister Claim (Wächter: kein PR, kein Spiegel, kein laufender Worker, älter als 6 h) geben sie frei. Reparaturrunden zählen issueweit über PRs und Provider. Die Spalten kommen per Lern-App-Migration (Content-Agent-Lernapp #433) und müssen vor dem Merge angewendet sein.

**Noch kein autonomer Produktionsfallback:** Ein Codex-Startweg fehlt (Kommentar-Eingang meldet Zuordnungsfehler); der Dispatcher startet nur Claude. Linear hält die bisherigen Aufträge. Datei-Proben und simulierte Reservierungen ersetzen keine Live-Abnahme. Belege und Wiederaufnahmebedingungen: [SIN-832-fallback.md](decisions/SIN-832-fallback.md).

## Zwei Bau-Worker und lesende Subagents (SIN-856)

Der Leitstand-Dispatcher hat maximal zwei Plätze (`LEITSTAND_MAX_PARALLEL`, Standard 2, Deckel 2); mit 1 lässt sich serialisieren. Die vorhandene Variable `LOOP_MAX_PARALLEL` bleibt für andere Produkt-Repos wirksam. Dispatcher, Merge-Nachlauf und Wächter lesen dieselbe Grenze.

Parallel werden nur Issues mit explizit getrennten Schreibpfaden ausgewählt: `<!-- worker-pfade: ["src/app/ablauf", "src/lib/ablauf"] -->` in Linear. Gemeinsame Dateien, offene PRs und Steuerungsänderungen werden berücksichtigt; fehlt die Angabe, läuft die Aufgabe allein. Der Marker muss alle geplanten Änderungen umfassen und wird vom Worker eingehalten; er ist keine Sandbox.

Claude bekommt einen `lese-assistent` für abgegrenzte Recherche und Testanalyse (Read/Grep/Glob, gleiches Modell, 12 Turns). Ein Subagent gleichzeitig, keine Rekursion; Implementierung bleibt beim Hauptworker, Abschlussreview unabhängig. Subagents verbrauchen dasselbe Kontingent. Die konfigurierten CLI-Grenzen benötigen eine passende Claude-Code-Version; erst ein echter Worker-Lauf belegt ihre Wirkung.

Abnahme: Der echte Dispatch-CLI läuft in CI mit isolierten Netz-Fixtures (Claims, zwei Plätze, Konflikte, unabhängig paginierte PR-Dateien und Lesefehler). Zwei echte parallele Issues und ein protokollierter Subagent-Lauf sind für den Live-Nachweis von SIN-856 noch erforderlich.

## Prüfer, Merge-Gate und Bestand

**Aktuelle Belege (SIN-854):** Prüfer und Merge-Gate benötigen `LINEAR_API_KEY`, lesen den aktuellen Linear-Auftrag und binden bestandene Review-Belege an Head-SHA und vollständigen Auftragstext. Ein veralteter GitHub-Spiegel ist keine Merge-Grundlage. Worker-PRs mergen nur synchron mit geprüfter Head-SHA und unmittelbar erneut gelesenen Kriterien; es bleibt keine ausstehende Auto-Merge-Freigabe aktiv. Eine echte erneute Review kann mit `pruefer.yml` auf `main`, Eingaben `pr` und `pruefen=true`, angefordert werden; ohne diesen Schalter bleibt der manuelle Lauf trocken. Kontrollierte Gate-/Reparatur-Abnahme ohne externe Modellaufrufe: `node --import tsx --test src/lib/loop/beleg-stand.test.ts src/lib/loop/merge-gate.test.ts src/lib/loop/repair-cli.test.ts`. Aktivierungsgrenzen stehen in [SIN-854](decisions/SIN-854-aktuelle-belege.md).

**Bestandsabgleich (SIN-858):** Der Code-Lader sucht im gepinnten Git-Commit nach passenden Inhalten und Dateinamen und liest nur Treffer einzeln. Transport-Regression: `node --import tsx --test src/lib/bestand/cli.test.ts`; echte CLI gegen isolierte API-Fixtures für Linear-Cursor, vollständige GitHub-Seiten und Quellfehler bei unvollständigen Ergebnissen. Kein Live-Inventarnachweis.

**Prüfer-Diagnose (SIN-880):** `PRUEFER_PREIS_EIN` und `PRUEFER_PREIS_AUS` speisen nur die lokale Schätzung je Lauf, keine Denkzeit- oder API-Einstellung; die Werte stehen als Repo-Variablen, nicht im Repo. Der Prüfer sendet `reasoning_effort: low` und höchstens 6000 Tokens für Reasoning plus Antwort; die Schätzung ist keine harte Abrechnungssperre. HTTP-Fehler enthalten maximal 300 Zeichen redigierten Antworttext. Leere, ungültige oder am Tokenlimit abgebrochene Antworten scheitern mit benanntem Fehlerort; ein fehlgeschlagener Rückfall nennt beide Ursachen. Offline-Nachweis: `node --import tsx --test src/lib/pruefer/pruefer.test.ts src/lib/pruefer/cli.test.ts`. Erst ein echter Prüfer-Lauf nach Aktivierung belegt die API-Funktion.

**Prüfer-Basisbindung (SIN-880):** Ein älterer PR-Basis-Snapshot blockiert keinen neuen Review. Ausführbarer Prüfer und Triple-Dot-Diff verwenden den aktuellen geschützten `main`-Commit. Der PR-Snapshot wird separat erfasst. Vor Veröffentlichung werden Head, Snapshot, offener Zustand, beide Repos, Zielbranch sowie unverändertes geschütztes `main` erneut geprüft. Nach Fortschritt während des Laufs ist ein neuer Lauf nötig.

**Claude-Rückfall (SIN-880):** Native JSON-Ausgabe mit `output_config.format` und demselben Review-Schema ersetzt erzwungenes `tool_choice`. Antworttext wird lokal validiert; fehlendes/ungültiges JSON, Ablehnung und Tokenlimit bleiben Fehler. Den OpenAI-Fehler `credit_balance_exhausted` behebt die lokale Preisvariable nicht. Der vorhandene Claude-Rückfall bleibt für Kontingentfehler zuständig.
