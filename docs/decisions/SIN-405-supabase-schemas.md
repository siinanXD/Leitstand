# SIN-405: Ein Supabase-Projekt für alle Repos, getrennt nach Schemas

Status: Vorschlag zur Entscheidung durch Sinan. In diesem Issue wird nichts umgebaut.

Belege: [Supabase: eigene Schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Ausgangslage (Stand 08.10.)

- Ein Projekt `Content-Agent-Lernapp` (Ref `zxielkiwgcgxyudqemjb`, EU West). Alle 21 Tabellen liegen in `public`.
- Lern-App: `courses`, `units`, `questions`, `learning_progress`, `evaluations`, `shared_modules` und weitere. Pipeline: `pipeline_run_costs`, `content_factory_runs`, `judge_runs`. Leitstand: `loop_events`, `loop_snapshot`, `leitstand_nutzer`.
- Ziel: alle Repos nutzen dasselbe Projekt und in Infisical überall dieselben Supabase-Schlüssel. Ein Projekt spart Geld und Pflege.

## Entscheidung (Vorschlag)

1. Ein Schema je App: `lernapp`, `leitstand`, später `<neue-app>`. Dazu `plattform` für Gemeinsames (Loop-Ereignisse, Kosten-Ledger, Tokens, Nutzer-Rollen).
2. Bestehende Tabellen bleiben vorerst in `public` (gehören der Lern-App). Ein Umzug ist `risk:high` und nur mit Sinans Freigabe, eigenem PR und Backup.
3. Neue Tabellen entstehen immer im eigenen Schema. Nie neue Tabellen in `public`.
4. Jedes Schema hat eigene RLS-Regeln und eine eigene Postgres-Rolle für Schreibzugriff.
5. Der Browser nutzt nur den `anon`-Schlüssel plus Sitzung (`authenticated`). `service_role` nur serverseitig (Workflows, API-Routen), nie im Client.
6. Jedes Repo migriert nur sein eigenes Schema (`supabase/migrations/<schema>/…`). `plattform` migriert nur die Lern-App (Besitzerin des Projekts). Deren `migrate.yml` ist die einzige Stelle, die gegen die Produktion migriert.

## Annahmen

- Die Lern-App bleibt Besitzerin des Projekts; Leitstand und weitere Repos bekommen keinen eigenen Migrationslauf gegen Produktion.
- Es gibt einen einzigen Nutzer (Sinan); `leitstand_nutzer` ist die Freigabeliste für den Leitstand (siehe `SIN-304-anmeldung.md`).
- Die genaue Liste der 21 Tabellen liegt im Lern-App-Repo. Hier sind nur die im Issue genannten aufgeführt; die übrigen zählen als Lern-App und bleiben (Zeile „weitere“). Vor jedem Umzug wird die Liste gegen die Datenbank geprüft (`select table_name from information_schema.tables where table_schema = 'public'`).
- Realtime nutzt der Leitstand heute nicht (siehe `SIN-304-anmeldung.md`, „LIVE“ fehlt bewusst). Für die Lern-App ist das unbestätigt und muss vor einem Umzug geprüft werden.

## Besitzer je Schema

| Schema | Besitzer (Repo) | Inhalt | Migrationen |
| --- | --- | --- | --- |
| `public` | Lern-App | Bestand, bleibt vorerst | `supabase/migrations/` der Lern-App |
| `lernapp` | Lern-App | künftige Lern-App-Tabellen (Ziel, nicht jetzt) | Lern-App |
| `plattform` | Lern-App (Projektbesitzerin) | `loop_events`, `loop_snapshot`, Kosten-Ledger, Tokens, Nutzer-Rollen | nur Lern-App |
| `leitstand` | Leitstand | `leitstand_nutzer`, spätere Aktions-Protokolle | `supabase/migrations/leitstand/` im Leitstand, ausgeführt von der Lern-App-CI |

Hinweis: Das Leitstand-Repo schreibt Migrationsdateien, führt sie aber nicht selbst gegen Produktion aus. Wie die Lern-App-CI diese Dateien erhält (Submodul, Kopie oder Aufruf aus dem Leitstand-Repo), ist offen und ein eigenes Folge-Issue.

## Tabellenplan

Reihenfolge ist verbindlich. Jeder Schritt ist ein eigener PR, `risk:high`, nur nach Freigabe.

| Tabelle | Heute | Ziel | Reihenfolge | Begründung |
| --- | --- | --- | --- | --- |
| `courses`, `units`, `questions`, `learning_progress`, `evaluations`, `shared_modules`, weitere Lern-App-Tabellen | `public` | bleibt | – | Gehört der Lern-App, hängt an RLS, API-Pfaden und evtl. Realtime. Kein Nutzen für einen Umzug jetzt. |
| `pipeline_run_costs`, `content_factory_runs`, `judge_runs` | `public` | bleibt zunächst; `pipeline_run_costs` später nach `plattform` prüfen | – (später) | Kosten-Ledger ist plattformweit, aber die Pipeline schreibt heute in `public`. Erst nach Umzug 1 bis 3 neu bewerten. |
| `leitstand_nutzer` | `public` | `leitstand` | 3 | Gehört allein dem Leitstand. Wird von RLS der Leitstand-Tabellen und von `plattform` gelesen, deshalb nach den `plattform`-Tabellen. |
| `loop_events` | `public` | `plattform` | 1 | Mehrere Repos schreiben hinein. |
| `loop_snapshot` | `public` | `plattform` | 2 | Wie `loop_events`; wird mit ihnen gelesen. |
| neue Aktions-Protokolle (Freigeben, Planer jetzt, Notbremse) | – | `leitstand` | neu | Entstehen direkt im Zielschema, kein Umzug. |

Hinweis zur Reihenfolge: Die RLS-Policy auf `loop_events` und `loop_snapshot` prüft `leitstand_nutzer`. Beim Umzug von Schritt 1 und 2 verweist die Policy mit Schemanamen auf `public.leitstand_nutzer`; Schritt 3 ändert diesen Verweis. `alter table … set schema` behält Policies, Indizes, Trigger und Berechtigungen der Tabelle, aber Policies mit festem Schemanamen und Views/Funktionen, die die Tabelle ohne Schema nennen, müssen angepasst werden.

### Ablauf je Umzug (Schritte 1 bis 3)

1. **Backup**: Vollständiger Dump des Projekts (`pg_dump` über die Verbindungszeichenfolge oder Supabase-Backup) und Tabellen-Export der betroffenen Tabelle. Zeilenzahl notieren. Ohne bestätigtes Backup keine Freigabe.
2. **Vorabprüfung**: Abhängigkeiten der Tabelle suchen (Policies, Views, Funktionen, Trigger, Fremdschlüssel, Publikation `supabase_realtime`).
3. **Migration** (eine Transaktion):
   - `create schema if not exists <ziel>;`
   - `grant usage on schema <ziel>` an `anon`, `authenticated`, `service_role` laut Rechte-Matrix.
   - `alter table public.<tabelle> set schema <ziel>;`
   - Tabellenrechte und Default-Privileges im Zielschema setzen.
   - Policies mit festen Schemanamen neu anlegen.
   - Falls Realtime genutzt: Tabelle in Publikation `supabase_realtime` wieder aufnehmen und prüfen.
4. **Kompatibilitätsbrücke** (nur für Schritt 1 und 2): In `public` eine View gleichen Namens (`security_invoker = true`) anlegen, damit Clients, die noch ohne Schema schreiben oder lesen, nicht sofort brechen. Die View wird entfernt, sobald alle Clients umgestellt sind.
5. **Clients umstellen** im selben oder direkt folgenden PR: Siehe Abschnitt „Zugriffe nach dem Umzug“.
6. **Prüfung**: Zeilenzahl gleich, Lesen als Sinan im Leitstand geht, Lesen ohne Sitzung liefert nichts, Schreiben aus dem Loop-Workflow klappt (ein Test-Ereignis).
7. **Rückweg**: `alter table <ziel>.<tabelle> set schema public;`, Brücken-View entfernen, Policies zurückspielen, Clients zurückstellen. Bei Datenschaden Wiederherstellung aus dem Backup aus Schritt 1. Das Rückweg-SQL liegt als Down-Datei im selben PR.

## Rechte-Matrix

Gilt für die Zielschemata. `public` bleibt wie in der Lern-App.

| Schema / Tabelle | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- |
| `plattform.loop_events` | kein Zugriff | lesen, wenn in `leitstand_nutzer` (RLS) | lesen und schreiben (Workflows) |
| `plattform.loop_snapshot` | kein Zugriff | lesen, wenn in `leitstand_nutzer` (RLS) | lesen und schreiben |
| `plattform` Kosten-Ledger | kein Zugriff | lesen, wenn in `leitstand_nutzer` (RLS) | lesen und schreiben (Pipeline) |
| `plattform` Tokens | kein Zugriff | kein Zugriff | nur serverseitig |
| `leitstand.leitstand_nutzer` | kein Zugriff | nur eigene Zeile lesen | lesen und schreiben |
| `leitstand` Aktions-Protokolle | kein Zugriff | lesen, wenn in `leitstand_nutzer` | schreiben (Aktionen laufen serverseitig) |
| `lernapp` / `public` (Lern-App) | wie heute | wie heute | wie heute |

Regeln dazu:

- RLS ist auf jeder Tabelle in jedem exponierten Schema eingeschaltet. Ohne Policy kommt nichts zurück.
- Das Recht `usage` auf das Schema allein reicht nicht; Tabellenrechte werden einzeln vergeben (`grant select`). Kein pauschales `grant all`.
- Schreibzugriff für Repos mit eigener Postgres-Rolle (`leitstand_schreiber`, `lernapp_schreiber`): Diese Rolle darf nur in ihr Schema schreiben. Solange alle Server `service_role` nutzen, bleibt das ein späterer Ausbau; die Matrix gilt dann für die Rolle statt für `service_role`.
- `service_role` umgeht RLS. Der Schlüssel liegt nur in Infisical und in Server-Umgebungen (Vercel Server, GitHub Actions), nie in `NEXT_PUBLIC_*`.

## Data API (Exposed schemas)

- Unter Settings → API → „Exposed schemas“ nur Schemas freigeben, die der Browser braucht: `public` (Lern-App), `plattform` und `leitstand`.
- `service_role`-Zugriffe aus Workflows laufen ebenfalls über die Data API und brauchen daher dieselbe Freigabe.
- Clients wählen das Schema: `createClient(url, key, { db: { schema: 'plattform' } })`. Für Abfragen auf mehrere Schemas pro Client: `client.schema('leitstand').from(…)`.
- Reine REST-Aufrufe setzen Header: Lesen `Accept-Profile: <schema>`, Schreiben `Content-Profile: <schema>`.

## Prüfung: Zugriffe nach dem Umzug

| Zugriff | Heute | Bleibt gültig? | Nötige Änderung |
| --- | --- | --- | --- |
| Vercel (Leitstand, Browser) `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/browser-client.ts` | URL und Schlüssel ja, Projekt ändert sich nicht | `src/lib/supabase.ts` liest `loop_events` und `loop_snapshot` per `client.from(…)` im Standardschema. Nach Umzug: `client.schema('plattform').from(…)`. Test in `src/lib/uebersicht.test.ts` (Fake-Client) passt dazu an. |
| Workflow `scripts/loop/loop.ts` mit `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | POST auf `/rest/v1/loop_events` ohne Profil-Header | URL und Schlüssel ja | Header `Content-Profile: plattform` ergänzen, sonst 404 nach dem Umzug. Mit der Brücken-View aus Schritt 4 läuft es in der Übergangszeit weiter. |
| Lern-App-Pipeline (schreibt `loop_events`, Kosten) | `public` | Schlüssel ja | Profil-Header bzw. `.schema('plattform')` im Lern-App-Repo, eigener PR dort. |
| Magic-Link-Anmeldung (Auth) | Schema `auth` | ja, unberührt | keine |
| Realtime | Leitstand: nicht genutzt | Publikation `supabase_realtime` ist je Tabelle, `set schema` ändert die Mitgliedschaft nicht, aber Kanäle müssen `schema: 'plattform'` angeben | Vor Umzug in der Lern-App suchen, ob Realtime auf diese Tabellen hört (`select * from pg_publication_tables`). Wenn ja: Kanalfilter anpassen und testen. |
| Infisical `/leitstand` | – | – | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` mit denselben Werten wie `/content-agent-lernapp`. Kein neuer Schlüssel. |

Ergebnis: Die Schlüssel und die URL bleiben gültig, denn das Projekt bleibt dasselbe. Gebrochen werden können nur Aufrufe, die das Schema nicht angeben, und Realtime-Kanäle. Beides ist mit Brücken-View und Profil-Header abgedeckt und wird je Umzug geprüft.

## Hinweis für neue Repos (Projekt-Starter, [SIN-202](https://linear.app/sinan-kahraman/issue/SIN-202/projekt-starter-neues-repo-mit-einem-schritt-infisical-vercel-sentry))

Der Starter legt für ein neues Repo **kein neues Supabase-Projekt** an, sondern:

1. ein neues Schema `<neue-app>` mit eigenen RLS-Regeln (Migration im Verzeichnis `supabase/migrations/<neue-app>/`, ausgeführt über die Lern-App-CI),
2. einen Eintrag unter „Exposed schemas“, falls der Browser lesen soll,
3. in Infisical dieselben Supabase-Schlüssel wie `/content-agent-lernapp` (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`),
4. im Code `createClient(url, key, { db: { schema: '<neue-app>' } })`.

## Folge-Issues (vorgeschlagen, alle `risk:high`, nur mit Sinans Freigabe)

1. Schemas `plattform` und `leitstand` anlegen, Rechte und „Exposed schemas“ setzen (noch ohne Datenumzug; geringes Risiko, aber Sicherheitsregel betroffen).
2. Umzug `loop_events` nach `plattform` samt Brücken-View, Clients (`src/lib/supabase.ts`, `scripts/loop/loop.ts`, Lern-App-Pipeline) und Backup.
3. Umzug `loop_snapshot` nach `plattform`.
4. Umzug `leitstand_nutzer` nach `leitstand`, RLS-Verweise anpassen.
5. Migrationsablauf klären: wie die Lern-App-CI (`migrate.yml`) `supabase/migrations/<schema>/` anderer Repos ausführt.
6. Realtime-Inventur in der Lern-App (welche Tabellen, welche Kanäle).
7. Projekt-Starter (SIN-202): Schritt „Schema statt Projekt“ aufnehmen.
8. Später: Rolle je Schema für Schreibzugriff statt gemeinsamem `service_role`; `pipeline_run_costs` nach `plattform` prüfen.

Verwandt: SIN-303 (Tabellen `loop_events`, `loop_snapshot`), SIN-304 (Leitstand liest sie), SIN-202 (Projekt-Starter), SIN-401 (Repo mit Loop verbinden).
