Zahl ohne Wort → zeitInWorten()/Einheit (SIN-578)
enableAutoMerge bei grünen Checks → clean status → direkt mergen (SIN-585)
Geplanter GitHub-Cron fällt unter Last aus → wichtige Läufe zusätzlich per workflow_run nach dem Merge starten (SIN-593)
Push-Fenster kürzer als Ruhezeit → nachts Gemergtes verfällt; Fenster ab Merge in der Ruhe auf 10 h (SIN-593)
Migration auf main ≠ Migration in Supabase → nach Merge prüfen (SIN-592)
Claim als Kommentar oder Label → zwei Worker am selben Issue möglich, Reparaturzähler beginnt je PR bei null → Reservierung per Compare-and-swap auf `leitstand_aufgaben.claim_revision` vor dem Start, Freigabe nur mit Beleg, Reparaturen issueweit zählen (SIN-832).
Linear-Projektabfrage mit 100 Issues und verschachtelten Relationen überschreitet 10.000 Komplexitätspunkte → Seiten zu 25 vollständig über pageInfo/endCursor lesen (SIN-825).
Verschachtelte Projekt-Metadatenabfrage multipliziert standardmäßig 50 Projekte × 250 Titel → bei exaktem Projektnamen first: 1 setzen; sonst bleibt der Planer nach erfolgreichem Issue-Lesen rot (SIN-825).
Prüfer vom PR-HEAD mit Secrets ausführen → Basis-Commit/Lockfile auschecken, Install-Skripte sperren und PR ausschließlich als validierten SHA-Diff lesen (SIN-827).
Relativer `import("./scripts/…")` in actions/github-script → löst gegen das Action-Verzeichnis auf, das Gate stürzt ab und kein PR mergt; lokale Module nur über `${process.env.GITHUB_WORKSPACE}/…` importieren (SIN-848).
Ledger-Zeile mit Spalte `payload` an loop_events → PostgREST 400, Beleg verloren, Lauf trotzdem „ok“; roter Lauf nur als `exit 2` ohne Grund → `grund` ist Pflicht, Fehler zusätzlich als `::error::`-Annotation, neue Spalten per Migration (Lernapp wendet an, Leitstand prüft nur) (SIN-848).

Research-CLI mit Top-Level-await startet im CommonJS-Projekt nicht, selbst trocken → async main mit Fehlerabschluss; den tatsächlichen CLI-Einstieg ohne Netz sowie mit positiven/negativen Quellen-Fixtures testen (SIN-826).
Numerische Datumsangabe im Team-Link verletzt den bestehenden Verständlichkeits-Test → Beschriftung ohne nackte Ziffern, Prüfdatum im verlinkten Bericht belassen; Browser-Gate unverändert lassen (SIN-826).
Context7-Regel ohne konfigurierte Laufzeit hilft dem Worker nicht → pro Repo HTTP-MCP und genaue Dokurechte prüfen; öffentliche MCP-Probe ist noch kein Claude-Actions-Nachweis, Rechte erst nach Draft-Freigabe aktivieren (SIN-537).
Gedächtnis-Sync darf historische Entscheidungen nicht zu Tages-Snapshots machen → bestehende Notizen samt Datum/Status erhalten; Produktlinks mit tatsächlichem Seitennamen erzeugen (SIN-615).


### SIN-615: Dokumentationsprobe ersetzt keinen produktiven Writer-Nachweis

Entscheidungshistorie und reparierte Produktlinks an einer vorhandenen historischen Notiz aus dem produktiven GitHub-Vault zurücklesen. Datum, Status und Herkunft getrennt gegen den gelesenen Ausgangsstand prüfen. Ein Text im lokalen Checkout oder selbst gesetzter Erfolgsmarker belegt keine ausgeführte Synchronisierung.



### SIN-827: sicherer Checkout reicht bei PR-kontrollierter Workflowdefinition nicht

Ein pull_request-Workflow nutzt die YAML-Definition aus dem PR-Merge-Commit. Vor produktiven Secrets muss auch die Definition aus dem vertrauenswürdigen Default-Branch stammen. Zielbranch, Schutzmerkmal und Workflow-/Basis-/Head-Bindung vor Checkout prüfen. Retargeting entwertet alte Ergebnisse; vor Veröffentlichung erneut gegen die aktuelle API vergleichen. pull_request_target allein ersetzt weder sichere Datenbehandlung noch unabhängigen Schutz des Default-Branches. Quelle: docs/decisions/SIN-827-pruefer-vertrauensbasis.md.

Ein always-Schritt läuft nicht, wenn die Job-Bedingung den Draft vorher ausschließt: Basiswechsel zur Entwertung zulassen, Modellschritt weiter durch Zielvalidierung sperren; echte Job-Bedingung mit Draft-/Titel-/Fork-Gegenproben testen (SIN-827).

- Die globale Worker-Grenze erhöhen → verändert auch Produkt-Repos und verhindert keine Dateikonflikte. Richtig: Leitstand separat auf zwei begrenzen, explizite Schreibpfade prüfen, unklare Aufgaben allein starten; lesende Subagents ersetzen keinen unabhängigen Prüfer. (SIN-856)

- SIN-856: Geplante Schreibpfade allein erkennen keine unabhängigen PRs. Tatsächliche GitHub-Dateilisten vollständig laden und den echten Dispatcher mit Claims testen; Fixture-Erfolg bleibt vom Live-Nachweis getrennt.
GitHub-Spiegel und reine Checkbox-Hashes übersehen geänderte nummerierte Kriterien → Prüfer und Gate lesen denselben aktuellen Linear-Auftrag; Hash über vollständigen Text, nur Häkchen-Stand ausnehmen. Zwei Reparaturrunden mit tatsächlichem CLI/API-Fixture bis needs-human in GitHub und Linear prüfen (SIN-854).

`UNSTABLE` ist kein grüner Check → Direkt-Merge nur bei CLEAN; das echte Gate gegen Altfristen und Schutzgrenzen ausführen statt Regex-Vorkommen zu prüfen (SIN-855).

- SIN-854: Ein Code-Review kann keinen erst nach Aktivierung möglichen Folge-Merge belegen. Solche Kriterien ausdrücklich markieren, als unbelegt erhalten und Done weiter sperren; sonst bleibt ein korrekt geschützter Workflow in einer zirkulären Freigabe hängen.
Tests eines Seitenzählers belegen keine Cursor-API → echten Collector-CLI mit isolierten Linear-/GitHub-Antworten prüfen (Cursorfortschritt, Wiederholung, fehlender Cursor, incomplete_results/1000er-Limit); Quellfehler dürfen keine Teilmenge als vollständig ausgeben. Code-Dateien erst gezielt über gepinntes Git suchen, dann nur Treffer einzeln laden (SIN-858).


HTTP-Status ohne Antworttext und JSON.parse auf leerer Modellantwort verbergen den Prüfer-Abbruch → redigierte Provider-Diagnose vor Kürzung, beide Rückfallursachen erhalten, Tokenlimit/Reasoning explizit setzen und echte CLI mit API-Fixtures prüfen; Preisvariablen sind USD/Million Tokens, keine Denkeinstellung (SIN-880).
Ein älterer PR kann noch eine frühere base.sha nennen → Prüfer-Runtime an aktuellen geschützten main-SHA binden, PR-Snapshot separat erfassen und vor Veröffentlichung beide Bindungen samt Zielrepo/Zielbranch/Schutz erneut prüfen (SIN-880).
Claude lehnt erzwungenes tool_choice tool/any ab → für reine Review-JSONs native output_config.format=json_schema senden und text-Blöcke validieren; OpenAI credit_balance_exhausted ist ein API-Guthabenfehler, keine Preisvariablen- oder Denkzeitfrage (SIN-880).
Nur Quellmetadaten auf Secrets prüfen reicht nicht → auch die frei eingegebene Anfrage vor Quellenzugriff und Berichtserzeugung mit dem vorhandenen Detektor abweisen; CLI-Probe darf bei einem erkannten Secret keine JSON-Datei anlegen (SIN-858).

- SIN-856: Wiederaufnahme nach Owner-Auftrag aktualisiert main und Belege, setzt aber weder Reparaturzähler noch needs-human zurück; echte Parallel-/Subagent-Proben folgen erst nach Aktivierung.
- SIN-877: Fehlende Codestelle ist kein Phasennachweis; nur explizit klassifizierte Nachweise an aktuellen Nachaktivierungs-Haken zurückstellen, alte Funde konservativ lassen.
- SIN-903: `loop_events.status` hat einen Check (start/ok/fehler/uebersprungen); ein anderer Wert ("failed") lässt den ganzen Sammel-Insert scheitern → nur erlaubte Werte schreiben, Test gegen die Liste.
- Worker soll Linear per `curl … $LINEAR_API_KEY` lesen → claude-code-action lehnt Befehle mit Umgebungsvariablen ab; Key gehört in ein Skript (`scripts/loop/auftrag.ts`), das in allowedTools steht (SIN-945).
- Folge-PR zu einem schon gemergten Auftrag (SIN-907 #366) blieb am Prüfer hängen, weil er auch `- [x]`-Haken erneut im Diff verlangte → abgehakte Punkte gelten als belegt (früherer PR), nur `- [ ]` ist vor dem Merge Pflicht (`bewerte` in `pruefer.ts`).
Dateispezifisches `Write(datei)` in `claude-code-action --allowedTools` erzeugt Berechtigungsablehnungen und kein Artefakt → keine breite `Write`-Freigabe erteilen, sondern `--json-schema`/`structured_output` nutzen und nur den festen Workflow das Ergebnisartefakt schreiben lassen (SIN-907).
- Issue mit gemergtem „Part of“-PR und nur `[nach Aktivierung]` offen startete immer wieder neu, der Worker endete ohne PR und sein Claim sperrte `@steuerung` → beim Warten auf den Live-Beleg auch „Part of“-PRs als gemergt zählen; Claims solcher Issues belegen keinen Platz (SIN-918).
- Dispatch schrieb alle 15 Min dasselbe `uebersprungen`/`platz` (über 1.000 Zeilen je Woche ohne Neuigkeit) und Rollen-Proben suchten falsche `agent`-Namen → gleichen Stand nur alle 6 h speichern (`istWiederholung`); Proben an der echten Quelle festmachen (`step`, erfolgreicher Workflow-Lauf) (SIN-952).
- Kriterien-Check verglich den Marker unmaskiert, Linear liefert `\[nach Aktivierung\]` → jeder Dispatch setzte einen weiteren davor und schrieb ~20 Issues neu (SIN-887 mit 30+ Markern) → Linear-Text vor Vergleichen immer entmaskieren (`ohneMaskierung`), Marker per Muster mit optionalem `\` erkennen (SIN-953).
- Haken mit Live-Beleg (Trockenlauf, Zählung) blieben offen, weil nur der Bau-Worker existierte und der weder Workflows starten noch Supabase lesen darf → Lauf-Issues (Label `lauf`, Block `<!-- lauf: … -->`) startet der Dispatcher selbst per `workflow_dispatch` aus einer Erlaubt-Liste (SIN-887).
- `waechter.yml` lief 66-mal am Tag per `workflow_dispatch` ohne Eingaben, `dry_run` stand auf `true` → nur Trockenläufe, Snapshot und Hänger-Reparatur standen still. Schalter für Trockenläufe immer mit Standard `false`; den Trockenlauf setzt nur ein Mensch von Hand (SIN-965).
- Automatik startete Workflows per `workflow_dispatch` ohne `dry_run`, deren Standard `true` ist (Wächter, Abnahme über Lauf-Spur) → Trockenläufe ohne Wirkung; geplante Läufe fallen bei GitHub oft aus. Jeder automatische Start übergibt `dry_run` ausdrücklich, Takt-Workflows haben Standard `false`, Fehlerklassen-Test `src/lib/loop/fehlerklassen.test.ts` (SIN-967).
- Probe-Text gegen eine mit `curl` geholte API-Antwort geprüft: GitHub rückt JSON nur für curl ein, `fetch` bekommt es kompakt → Probe-Texte formatunabhängig wählen und GitHub-API in Proben mit Token abrufen (Rate-Limit 60/h ohne Token) (SIN-967).
