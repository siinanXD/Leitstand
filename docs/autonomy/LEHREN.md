Zahl ohne Wort → zeitInWorten()/Einheit (SIN-578)
enableAutoMerge bei grünen Checks → clean status → direkt mergen (SIN-585)
Geplanter GitHub-Cron fällt unter Last aus → wichtige Läufe zusätzlich per workflow_run nach dem Merge starten (SIN-593)
Push-Fenster kürzer als Ruhezeit → nachts Gemergtes verfällt; Fenster ab Merge in der Ruhe auf 10 h (SIN-593)
Migration auf main ≠ Migration in Supabase → nach Merge prüfen (SIN-592)
Linear-Projektabfrage mit 100 Issues und verschachtelten Relationen überschreitet 10.000 Komplexitätspunkte → Seiten zu 25 vollständig über pageInfo/endCursor lesen (SIN-825).
Verschachtelte Projekt-Metadatenabfrage multipliziert standardmäßig 50 Projekte × 250 Titel → bei exaktem Projektnamen first: 1 setzen; sonst bleibt der Planer nach erfolgreichem Issue-Lesen rot (SIN-825).
Prüfer vom PR-HEAD mit Secrets ausführen → Basis-Commit/Lockfile auschecken, Install-Skripte sperren und PR ausschließlich als validierten SHA-Diff lesen (SIN-827).
Ledger-Zeile mit Spalte `payload` an loop_events → PostgREST 400, Beleg verloren, Lauf trotzdem „ok“; roter Lauf nur als `exit 2` ohne Grund → `grund` ist Pflicht, Fehler zusätzlich als `::error::`-Annotation, neue Spalten per Migration (Lernapp wendet an, Leitstand prüft nur) (SIN-848).

Research-CLI mit Top-Level-await startet im CommonJS-Projekt nicht, selbst trocken → async main mit Fehlerabschluss; den tatsächlichen CLI-Einstieg ohne Netz sowie mit positiven/negativen Quellen-Fixtures testen (SIN-826).
Numerische Datumsangabe im Team-Link verletzt den bestehenden Verständlichkeits-Test → Beschriftung ohne nackte Ziffern, Prüfdatum im verlinkten Bericht belassen; Browser-Gate unverändert lassen (SIN-826).


### SIN-827: sicherer Checkout reicht bei PR-kontrollierter Workflowdefinition nicht

Ein pull_request-Workflow nutzt die YAML-Definition aus dem PR-Merge-Commit. Vor produktiven Secrets muss auch die Definition aus dem vertrauenswürdigen Default-Branch stammen. Zielbranch, Schutzmerkmal und Workflow-/Basis-/Head-Bindung vor Checkout prüfen. Retargeting entwertet alte Ergebnisse; vor Veröffentlichung erneut gegen die aktuelle API vergleichen. pull_request_target allein ersetzt weder sichere Datenbehandlung noch unabhängigen Schutz des Default-Branches. Quelle: docs/decisions/SIN-827-pruefer-vertrauensbasis.md.

Ein always-Schritt läuft nicht, wenn die Job-Bedingung den Draft vorher ausschließt: Basiswechsel zur Entwertung zulassen, Modellschritt weiter durch Zielvalidierung sperren; echte Job-Bedingung mit Draft-/Titel-/Fork-Gegenproben testen (SIN-827).
