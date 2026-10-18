Zahl ohne Wort → zeitInWorten()/Einheit (SIN-578)
enableAutoMerge bei grünen Checks → clean status → direkt mergen (SIN-585)
Geplanter GitHub-Cron fällt unter Last aus → wichtige Läufe zusätzlich per workflow_run nach dem Merge starten (SIN-593)
Push-Fenster kürzer als Ruhezeit → nachts Gemergtes verfällt; Fenster ab Merge in der Ruhe auf 10 h (SIN-593)
Migration auf main ≠ Migration in Supabase → nach Merge prüfen (SIN-592)
Linear-Projektabfrage mit 100 Issues und verschachtelten Relationen überschreitet 10.000 Komplexitätspunkte → Seiten zu 25 vollständig über pageInfo/endCursor lesen (SIN-825).
Verschachtelte Projekt-Metadatenabfrage multipliziert standardmäßig 50 Projekte × 250 Titel → bei exaktem Projektnamen first: 1 setzen; sonst bleibt der Planer nach erfolgreichem Issue-Lesen rot (SIN-825).
Research-CLI mit Top-Level-await startet im CommonJS-Projekt nicht, selbst trocken → async main mit Fehlerabschluss; den tatsächlichen CLI-Einstieg ohne Netz sowie mit positiven/negativen Quellen-Fixtures testen (SIN-826).
Numerische Datumsangabe im Team-Link verletzt den bestehenden Verständlichkeits-Test → Beschriftung ohne nackte Ziffern, Prüfdatum im verlinkten Bericht belassen; Browser-Gate unverändert lassen (SIN-826).
Zwei Fehlversuche sind Erstversuch plus eine Reparatur → Runtime-Grenze und alle Aufrufer aus derselben Konstanten ableiten, nicht drei Reparaturen zusätzlich erlauben (SIN-638).
