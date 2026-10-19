# SIN-836: Python/FastAPI-Dispatcher pilotieren

Stand 19.10.2026. Dieser PR liefert den **Output-Vertrag** (Voraussetzung vor jeder Migration), nicht den Dispatcher und keine Messung. Eine Migration ist nicht entschieden.

## Was geliefert ist

`src/lib/lauf/lauf.ts` (rein, mit Tests): nimmt eine Agenten-Ausgabe als Text an und gibt eine maschinenlesbare Antwort mit Code zurück (`ok`, `bereits_gespeichert`, `json_ungueltig`, `schema_ungueltig`, `konflikt`, `speicher_fehler`).

- Ergebnis wird gegen das vorhandene Rollen-Schema aus `docs/schemas/*.json` (SIN-491) geprüft, keine zweite Definition in Python. Pilot-Rolle: `bauen`. `schema_version` steht in der Hülle.
- Hülle: `run_id`, `agent`, `issue`, `schema_version`, `result`, `artifacts` (Pfad + SHA-256), `kosten_eur`, `zeitpunkt`. Prüfsumme über das kanonisch sortierte `result`.
- Zwei Schritte: `speichern` (Upsert, überschreibt nie) und `bestaetigen` (meldet nur beim echten Übergang `validiert` → `completed`). Nur dann gibt es `folgestart`.
- Kaputtes JSON, Schemafehler, Konflikt und Speicherfehler landen mit Rohoutput und Grund in `verwerfen` (geschützter Ablageort, Auditspur). Kein `completed`, kein Folgestart.
- Wiederholter Callback: genau ein Datensatz, kein zweiter Folgestart. Absturz zwischen Speichern und Bestätigen: die Wiederholung bestätigt den vorhandenen Datensatz.
- Schema-Prüfung ist keine fachliche Wahrheitsprüfung; dafür bleiben die Abnahme-Proben (SIN-626).

## Was offen ist

1. Messung Ist-Ablauf (Issue-Eingang → Dispatch → erster Worker-Schritt → PR/CI, mindestens 20 Läufe): nicht gemacht, braucht Zugriff auf `loop_events` und GitHub-Läufe.
2. FastAPI-Dispatcher mit einer Rolle und Vergleich der Startlatenz: nicht gebaut. Free-Tier-Limits und Verfügbarkeit des Hosters sind noch ungeprüft.
3. Supabase-Implementierung von `Speicher` (Tabelle für Läufe, Dead-Letter, Storage für große Artefakte, atomares `bestaetigen` als `update … where status = 'validiert'`): nicht gebaut. Migration und Secrets sind Sache von Sinan.
4. 20 identische Testfälle zu Kosten, Stabilität, Startlatenz; erst danach die Migrationsentscheidung. Kein zweites Steuerzentrum: Anzeige gehört in den Leitstand (SIN-577).

Sicherheitsvorgaben für den Dispatcher (getrennte Arbeitsverzeichnisse für Claude und Codex, kurze Berechtigungen, authentifizierte Webhooks, keine Secrets im Output) gelten unverändert und sind noch nicht umgesetzt.

Ausgelassen: Python-Code, Hosting, Messreihen, weitere Rollen-Schemas.
