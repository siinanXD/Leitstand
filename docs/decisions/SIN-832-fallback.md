# SIN-832: Fallback vorbereiten, Ausführungsgrenzen belegen

Stand: 19.10.2026. **Produktionsrouting bleibt unverändert.** PR #294 bleibt Draft; SIN-832 ist nicht technisch bereit und nicht Done.

## Bestandsaufnahme

- #294 hatte nur Rolle und Datei-Probe. Diese Änderungen werden erhalten.
- Der [Draft-opened-Pilot #266](https://github.com/siinanXD/Leitstand/pull/266#issuecomment-6253794114) ist belegt; Kommentare/Titeländerungen gehören nicht zu dessen dokumentiertem Eingang.
- Nach Veröffentlichung der Cloud-Umgebung scheitert der [Kommentar-Verbindungstest](https://github.com/siinanXD/Leitstand/pull/294#issuecomment-6272812637) weiter mit „create an environment“. Das ist eine Verbindungs-/Zuordnungsstörung, kein Quota-Beleg. Kein nachgewiesener Adapter zur Wiederaufnahme bestehender PRs verfügbar.
- Claude [39288861498](https://github.com/siinanXD/Leitstand/actions/runs/39288861498) endet unmittelbar; das leere Kontingent ist eine Nutzermeldung. `is_error:true` allein unterscheidet weder Quota noch Auth/Netz.
- SIN-827/[#269](https://github.com/siinanXD/Leitstand/pull/269) ist gemergt. Aktuelle unabhängige Live-Sicherheitsabnahme bleibt offen.
- [Prüfer #294](https://github.com/siinanXD/Leitstand/actions/runs/39252951628/job/118061027159): fehlende PRUEFER_MODELL/PRUEFER_PREIS_EIN/PRUEFER_PREIS_AUS, Exit 2 **vor** Modellaufruf; Ledger HTTP 400. Kein belegter Modell-Limitfehler.
- Queue: offene Linear-Issues und GitHub-Spiegel; Pausen: `kontingent_pausen`; Planersicht: `loop_snapshot.queue`. Keine zweite Queue, Tabelle, API oder neue Abhängigkeit angelegt. `loop_snapshot.queue` ist eine Zählung, keine atomare Workersperre.

## Vorbereitete Policy und Adaptervertrag

`src/lib/loop/fallback.ts` folgt dem vorhandenen Muster aus `src/lib/lauf/lauf.ts`: reine Entscheidung und übergebener Speichervertrag. Noch kein Produktionsspeicher-/Startadapter implementiert.

1. Claude ist gemäß aktuellem Nutzerauftrag erster Kandidat; geeignete risikoarme Aufträge dürfen zu Codex, wenn ein autorisierter, belegter Adapter existiert. Historische Codex-first-Vorgabe wird damit nicht still auf den aktuellen Auftrag übertragen.
2. Quota: belegte Reset-Zeit, sonst fünf Stunden; Netz: 15, dann 30 Minuten. Höchstens zwei Wiederholungen nach dem initialen Ausfall. Danach neue Verfügbarkeitsbelege erforderlich. Auth, Verbindung und unbekannte Fehler werden nie allein durch Zeitablauf freigegeben.
3. Fachlicher Fehler zählt beim Auftrag, nicht beim Provider. Ab zwei erfolglosen Reparaturen issueweit `needs-human`, auch bei Providerwechsel. Die produktive Zählung aus #275 bleibt Voraussetzung.
4. PR und Branch bleiben unverändert. Ein aktiver oder unklar beendeter Worker wird nie allein wegen Timeout verdrängt. Ein zukünftiger Adapter muss den Start eindeutig idempotent machen; bei verlorenem Start-ACK bleibt die Reservierung bestehen.
5. Speicher muss pro Issue Revision und Worker-Claim atomar vergleichen und dauerhaft schreiben. Erst bestätigte Reservierung erlaubt einen Start. Fehlgeschlagene Speicherung sperrt den Start. Ein späterer Leser muss denselben Stand laden; JSON-Roundtrip/Testspeicher beweist keine Produktionspersistenz.
6. JSON-Ereignisse enthalten Issue, PR, Branch, Provider, Fehlerklasse, Status, UTC-Zeit und kanonische Nachweislinks. Keine Fehlerrohtexte, Query-Tokens, Umgebungswerte oder Prompts übernehmen. `startbereit` ist kein Startbeleg. Ledger-Adapter später mit vorhandenem Schema prüfen, nicht ungeprüft `payload` schreiben (#296/SIN-848).

## Tests und Abnahme

`node --import tsx src/lib/loop/fallback.test.ts`: simuliert Claude verfügbar, Claude leer/Codex verfügbar, beide leer, Wiederaufnahme, fehlenden Adapter, Auth/Netz/Zuordnung, vorhandene PRs, Konkurrenzreservierung, Speicherausfall und Reparaturstopp. Tests verwenden keinen Modell-/Produktionsaufruf.

Lokale Prüfung: zehn Policy-Tests grün; Typecheck/Lint/Diff-Check grün. Gesamtsuite zusätzlich einzeln ausgeführt: 509 von 512 Tests grün, drei bestehende CLI-Tests durch Umgebungsgrenzen blockiert (`spawnSync git EPERM`, Research-CLI-Unterprozess ohne Ausgabe). `npm test` ebenfalls rot in diesen drei Dateien. Frisches `npm ci --offline` scheitert an fehlendem zustand-Cache; Shell-Netz am Umgebungsproxy nicht erreichbar. Vorinstallierte Abhängigkeiten wiederhergestellt. Neue GitHub-CI muss Installation und Gesamtsuite unabhängig prüfen; lokale Grenzen werden nicht durch Testsperren umgangen.

Die zusätzlichen `docs/abnahme.yml`-Proben prüfen Dateien/Registrierung. **Keine dieser Proben ist eine Live-Abnahme des Fallbacks.** Echte Übergaben in beide Richtungen, beide-leer samt Wiederaufnahme, ein persistierter Konkurrenztest und ein unabhängiger Kriterienabgleich fehlen.

## Wiederaufnahme

- Bestehende Codex-Konto-/Repo-Zuordnung im Kommentar-Eingang reparieren und einen autorisierten Start auf vorhandenem PR mit Claim/Commit/Completion belegen. Keine fingierte Cloud-API, kein Plus-zu-API-Ersatz.
- Vorhandene Persistenz auf atomare issueweite Reservierung prüfen und den Speicher-/Startadapter anbinden; Claude- und Reparatur-/Wächter-Eingänge müssen dieselbe Eigentümergrenze benutzen. Erst dann Scheduler/Cooldown produktiv verbinden.
- Prüferkonfiguration mit tatsächlich gewähltem Modell und dokumentierten Preisen herstellen; keine Werte/Budgets erfinden. Ledger-Schema gemäß #296 prüfen; keine Migration in diesem Auftrag angewendet.
- Nach unabhängiger Sicherheitsabnahme und erforderlicher Freigabe Live-Szenarien ausführen; bis dahin weder Merge noch Done. Reparaturgrenzen in #291/#275 nicht zurücksetzen.
- Folge-PRs #296, #291, #275, #294, #271 erst nach technischer Bereitschaft bearbeiten. Aktuelle Blocker bleiben erhalten; keine konkurrierenden PRs eröffnen.
