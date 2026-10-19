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

Lokale Prüfung zunächst: zehn Policy-Tests grün; Typecheck/Lint/Diff-Check grün. Gesamtsuite zusätzlich einzeln ausgeführt: 509 von 512 Tests grün, drei bestehende CLI-Tests durch Umgebungsgrenzen blockiert (`spawnSync git EPERM`, Research-CLI-Unterprozess ohne Ausgabe). `npm test` ebenfalls rot in diesen drei Dateien. Frisches `npm ci --offline` scheitert an fehlendem zustand-Cache; Shell-Netz am Umgebungsproxy nicht erreichbar. Vorinstallierte Abhängigkeiten wiederhergestellt. GitHub-CI 39294420729 bestätigt Installation, Typecheck, Lint, Gesamttests und Build; lokale Grenzen werden nicht durch Testsperren umgangen.

Unabhängiger Review 5575299063 auf 82760792 fand zwei P2-Lücken: Claim an Reparaturgrenze zuerst als aktiv erhalten; expliziten Fachfehler vor Transportheuristik auswerten. Erste gezielte Nacharbeitsrunde: beide Regressionen zuerst rot, danach zwölf Policy-Tests grün. Kein Reset bestehender Reparaturgrenzen; Folge-Review und CI des korrigierten Heads erforderlich.

Die zusätzlichen `docs/abnahme.yml`-Proben prüfen Dateien/Registrierung. **Keine dieser Proben ist eine Live-Abnahme des Fallbacks.** Echte Übergaben in beide Richtungen, beide-leer samt Wiederaufnahme, ein persistierter Konkurrenztest und ein unabhängiger Kriterienabgleich fehlen.

## Wiederaufnahme

- Bestehende Codex-Konto-/Repo-Zuordnung im Kommentar-Eingang reparieren und einen autorisierten Start auf vorhandenem PR mit Claim/Commit/Completion belegen. Keine fingierte Cloud-API, kein Plus-zu-API-Ersatz.
- Vorhandene Persistenz auf atomare issueweite Reservierung prüfen und den Speicher-/Startadapter anbinden; Claude- und Reparatur-/Wächter-Eingänge müssen dieselbe Eigentümergrenze benutzen. Erst dann Scheduler/Cooldown produktiv verbinden.
- Prüferkonfiguration mit tatsächlich gewähltem Modell und dokumentierten Preisen herstellen; keine Werte/Budgets erfinden. Ledger-Schema gemäß #296 prüfen; keine Migration in diesem Auftrag angewendet.
- Nach unabhängiger Sicherheitsabnahme und erforderlicher Freigabe Live-Szenarien ausführen; bis dahin weder Merge noch Done. Reparaturgrenzen in #291/#275 nicht zurücksetzen.
- Folge-PRs #296, #291, #275, #294, #271 erst nach technischer Bereitschaft bearbeiten. Aktuelle Blocker bleiben erhalten; keine konkurrierenden PRs eröffnen.

## Nachtrag 19.10.2026 abends: Reservierung angebunden (Claude, zweite Sitzung)

Claim https://github.com/siinanXD/Leitstand/pull/294#issuecomment-6273897553, Basis Head `454f1bc5`.

- **Speicher:** vorhandene Tabelle `leitstand_aufgaben` (Zeile je Linear-Issue) mit additiven Spalten `claim_revision`, `claim_provider`, `claim_id`, `claim_at`, `reparaturen`, `claim_nachweis` (Migration `20261019200000_aufgaben_reservierung`; angewendet über Lern-App #433, weil nur dort Migrationen laufen, wie SIN-848). Keine neue Tabelle, Queue oder Abhängigkeit. Der Aufgaben-Spiegel schreibt diese Spalten nie.
- **Compare-and-swap:** `src/lib/loop/reservierung.ts` setzt den `Speicher`-Vertrag um: `PATCH … ?issue=eq.X&claim_revision=eq.R` mit `return=representation`; genau eine Zeile zurück heißt gewonnen. Fehlt die Zeile, legt der erste Start sie mit echtem Linear-Titel an (Primärschlüssel: ein Gewinner); ohne Titel keine Platzhalterzeile, kein Start. HTTP-/Netzfehler werfen, Rohtexte werden nicht weitergegeben.
- **Dispatcher:** reserviert vor dem Anlegen des GitHub-Spiegels. Ohne Supabase, bei Lesefehler, vorhandenem Claim oder verlorenem CAS kein Start; Grund als strukturiertes JSON-Ereignis im vorhandenen Feld `loop_events.grund`. Scheitert der Start nach der Reservierung, bleibt der Claim (Ausgang unklar).
- **Freigabe nur mit Beleg:** Merge (`gemergt`, Beleg PR-URL), Reparaturstopp (`needs-human`, Beleg PR-URL), Wächter für verwaiste Claims (kein offener PR, kein offener Spiegel, kein laufender oder wartender `claude.yml`-Lauf, älter als 6 h; Beleg Wächter-Lauf). Unbekannter Worker-Zustand hält den Claim.
- **Reparaturgrenze:** `reparatur(labels, issueweit)` nimmt das Maximum aus Labels und dauerhaftem Zähler; Dispatcher (`planeFallback`, ab 2 `needs-human`), `repair.yml` und Wächter zählen dieselbe Spalte. Erst zählen, dann um Reparatur bitten; verlorener CAS = keine Runde. PRs ohne Linear-Kennung (Dependabot) zählen wie bisher über Labels. Eine Grenze für alle: `MAX_REPARATUR = 2` (Dispatcher, `repair.yml`, Wächter). Ein Merge setzt den Zähler mit Beleg zurück (die Runden davor waren nicht erfolglos); Stopp und Wächter-Freigabe nicht.
- **Zurücksetzen:** Nur Sinan setzt `reparaturen` nach einer Entscheidung zurück (SQL im Supabase-Editor), sonst bleibt ein Issue mit 2 erfolglosen Runden angehalten.

Tests: `src/lib/loop/reservierung.test.ts` (neun Simulationen gegen einen PostgREST-Nachbau mit echter CAS-Semantik: Anlegen, Doppelstart, paralleler CAS, Speicherfehler ohne Rohtext, kein Platzhalter, Zähler über Provider, Beleg-Pflicht, veralteter Stand, Verwaist-Regel, Injektion). Neue Regressionen in `auswahl.test.ts` und `waechter.test.ts` waren auf dem alten Code rot. **Simulation, kein Live-Nachweis.** Live-Probe `leitstand-reservierung-live` (db) wird erst nach Migration und erstem echten Dispatch grün.

Weiter offen: Codex-Startweg (Zuordnungsfehler, unverändert), Prüfer-Repo-Variablen (Werte unten belegt, Setzen durch Sinan, weil Actions-Variablen über den Sitzungs-Proxy nicht schreibbar sind), Live-Szenarien beide Richtungen und beide-leer.

Prüfer-Werte aus bestehender Entscheidung und offizieller Doku (19.10.2026): Modell `gpt-5.4-mini` (wie Lern-App-Review, `scripts/autonomy/review.mjs`), Preise 0.75 USD Eingabe und 4.50 USD Ausgabe je 1 Mio. Tokens ([Modellseite](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [Ankündigung](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/)). Ledger-HTTP 400 ist seit Lern-App #431 (Spalte `payload` live) behoben; #296 ergänzt `grund` und Annotation.

### Nacharbeit nach unabhängigem Review (erste Runde)

Review-Agent auf `af734b6`: zwei P1, drei P2. Behoben im selben PR:
- P1: Issues mit aktivem Claim oder ausgeschöpften Reparaturen belegen keinen Startplatz mehr (vor `waehle` herausgefiltert); bei Grenze einmalig Linear-Label `needs-human` plus Kommentar; `startbar` schließt `needs-human` aus. Sonst stand bei einem Platz die ganze Schlange.
- P1: eine Grenze 2 überall; Texte nennen `MAX_REPARATUR`.
- P2: fehlt die Zeile, legt die erste Reparaturrunde sie mit PR-Titel an (sonst nie wieder eine Runde).
- P2: Wächter lädt Zähler für alle Issues mit offenem PR (nicht nur mit Claim) und prüft den frisch geladenen Stand vor dem Zählen.
- P2: Wächter löst den Claim beim Zurücksetzen (Kontingent oder 6 h ohne PR) im selben Schritt, Beleg ist der eigene Lauf.
- P3: HTTP 400 nennt die fehlende Migration.
Offen (P3, dokumentiert): Aufräumen nur für Projekte, die der Wächter bearbeitet; Schutz gilt nur für Starts über den Leitstand-Dispatcher (manuelles `@claude` reserviert nichts).

Zweite Nacharbeitsrunde (Folge-Review auf `3088dcb`, alle sieben Befunde behoben, ein neuer P2): Beim Zurücksetzen nach 6 h ohne PR löst der Wächter den Claim nur, wenn belegt kein `claude.yml`-Lauf läuft oder wartet (Zeitablauf allein ist kein Beleg); sonst übernimmt `claimsAufraeumen` später. needs-human-Kommentar nur bei gesetztem Label, Labelvergleich klein geschrieben. Bekannt und hingenommen (P3): Ein Todo-Issue mit Claim, dessen Status-Wechsel auf In Progress scheiterte, belegt keinen Platz, `LOOP_MAX_PARALLEL` kann kurz überschritten werden (zwei Worker am selben Issue verhindert der Claim); eine per Reparatur angelegte Zeile trägt bis zum nächsten Spiegel den PR-Titel. Damit sind die zwei Nacharbeitsrunden dieses Pakets ausgeschöpft.
