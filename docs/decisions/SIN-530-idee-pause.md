# SIN-530: „+ Idee“ und „Pause“ in der Kopfzeile

- **Pause:** Im Repo gab es keinen `paused`-Schalter (Notbremse ist noch deaktiviert). Der Schalter ist deshalb das jüngste `loop_events`-Ereignis mit Schritt `PAUSE` (Status `pausiert` oder `weiter`). Kein neuer Speicher, kein Workflow-Eingriff. `scripts/loop/loop.ts dispatch` liest es und startet bei Pause nichts (Ereignis `dispatch/uebersprungen`). Ohne Supabase-Secrets oder bei Lesefehler läuft der Loop weiter.
- `GET /api/pause` liest ohne 24-h-Grenze, weil eine Pause länger dauern kann. `POST /api/pause` schreibt das Ereignis; schlägt das Protokoll fehl, gilt die Aktion als fehlgeschlagen.
- **Idee:** `POST /api/idee` legt per Linear-API (`LINEAR_API_KEY`, nur serverseitig) ein Issue an: Label `idee`, Meilenstein „v2 Ideen“. Bei „dringend“ zusätzlich Label `dringend`, Meilenstein „v1“, Status Todo. Das Linear-Projekt wird über den Projektnamen aus `src/lib/projekte.ts` gefunden.
- Beide Routen prüfen Sitzung und `leitstand_nutzer`. Protokoll: `loop_events` mit Schritt `idee` bzw. `PAUSE`. Beide Schritte stehen in `BETRIEB`, damit der Ablauf sie nicht als unbekannt meldet.
- Neue Issues brauchen **nicht** das Label `claude`; der Loop nimmt sie erst, wenn Sinan oder das Nachrücken es setzt.

## Aufgabe für Sinan (Label `sinan`)

`LINEAR_API_KEY` in Vercel eintragen. In Linear müssen je Projekt der Meilenstein „v2 Ideen“ und „v1“ sowie die Labels `idee` und `dringend` existieren, sonst meldet die Route den fehlenden Teil (HTTP 409). Der Linear-Projektname muss dem Namen in `PROJEKTE` entsprechen (z. B. „Lern-App“).
