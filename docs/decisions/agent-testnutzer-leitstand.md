# Agent-Testnutzer im Leitstand (SIN-913)

Stand 21.10.2026. Muster für alle Projekte (Folge-Issue „Testnutzer-Regel“).

## Entscheidung

Crawler, Playwright und PR-Belege sehen den Leitstand eingeloggt, ohne Passwort und ohne neues Secret:

1. Konto `agent` in Supabase Auth, vom Skript `scripts/agent-testnutzer/sitzung.ts` idempotent angelegt (`email_confirm: true`). Die Adresse steht in der Repo-Variable `AGENT_TESTNUTZER_EMAIL` und ist kein Secret.
2. Sitzung: `generateLink` (Magic-Link, Admin-API) → `verifyOtp` → `storageState` für Playwright (`src/lib/agent-testnutzer/sitzung.ts`). Genutzt wird der vorhandene `SUPABASE_SERVICE_ROLE_KEY`. Die Sitzung liegt nur im Job unter `RUNNER_TEMP` und wird nie als Artefakt hochgeladen; hochgeladen wird nur der Screenshot.
3. Nur lesen: Das Konto steht in `leitstand_nutzer` und sieht alle Seiten. Jede API-Route mit Aktion (Freigabe, Pause, Idee, Rollen, Version, Werbemittel, Wochencheck, Push) prüft über `verweigert()` in `src/lib/server-nutzer.ts`; für das Konto gilt außer Lesen immer 403, der Versuch landet in `loop_events` (Schritt `agent-testnutzer`).
4. Migration `20261022090000_agent_testnutzer.sql` legt restriktive Policies auf `leitstand_nutzer` an, die Schreiben nur für Sitzungen mit `app_metadata.agent_testnutzer = true` sperren (Marker beim Anlegen des Kontos setzen); andere Rollen bleiben unberührt. `src/app/api/aktionen.test.ts` prüft jede Aktions-Route (inkl. Pause/Notbremse, Kopplung) auf 403.

## Grenzen

- `POST /api/kopplung` (Kopplungscode für die eigene Adresse) prüft das Konto nicht, weil es damit nur seine eigene Sitzung koppelt.
- Die Zeile in `leitstand_nutzer` setzt das Skript mit der Spalte `user_id`; weicht das Schema ab, meldet der Lauf rot beim Lesen der Seiten.
