# AGENTS.md (Leitstand)

Regeln für alle Agenten in diesem Repo. Sie ersetzen Rückfragen an Sinan. Dieses Repo übernimmt die Regeln der Lern-App, bis der Projekt-Starter (SIN-202) sie automatisch liefert.

## Verbindlicher Auftragsabgleich (SIN-754)

Für Worker, Prüfer und Abschluss gilt [docs/autonomy/AUFTRAGSABGLEICH.md](docs/autonomy/AUFTRAGSABGLEICH.md). Vor Bau und vor jedem Push Linear samt Kommentaren/Eltern-/Masterauftrag neu lesen, vorhandene Logs/PRs prüfen und notwendige reversible Nacharbeit im freigegebenen Umfang selbst erledigen. Nur echte neue Entscheidungen an Sinan geben. Kein Done ohne aktuelle Kriterien und unabhängige Belege; ausstehende Live-Abnahme ist In Review, kein Anlass für einen blinden Neubau. Dieser Abschnitt hat Vorrang vor älteren pauschalen Merge-/Done- und Wiederholungsbeschreibungen unten.

## Zuerst lesen

1. Das zugewiesene Linear-Issue (SIN-304, SIN-305 unter SIN-242)
2. `siinanXD/Content-Agent-Lernapp`: `AGENTS.md`, `docs/design/regeln-2026.md`, `docs/design/tokens.json`
3. Figma-Datei `7Ti9iVUjUjw3rh9WYhSu9K` ist die einzige Quelle für Farben, Abstände, Komponenten. Maßgeblich ist die **Variante 2026**: Frame `10:3` „B1 Leitstand · Variante 2026 (Bento, präzise)“ (Kopfzeile, „Heute in einem Satz“ mit Belegen, Bento mit Pipeline-Schiene, In Arbeit, Zahlen, Braucht dich, Kontingente, Aktivität 24 h). Alle Zahlen und Texte in diesem Frame sind Beispiele und werden nie übernommen. Werte lesen, nicht schätzen: `npx tsx scripts/figma.ts --node <ID>` (Größen, Abstände, Farben, Texte, Schrift) und `--bild <ID>` (PNG zum Ansehen, SIN-428). Fehlt `FIGMA_ACCESS_TOKEN`, im PR „Figma nicht verfügbar“ schreiben.
4. Frames je Seite (Variante 2026), vor dem Bauen einer Seite den passenden lesen:
   - Übersicht (einfach, SIN-526): `52:190` (Desktop), `52:349` (Handy); Bausteine `51:191` Aufgabe, `51:199` Eintrag, `51:203` Zeile
   - Details (frühere Übersicht B1, `/details`): `10:3` (Desktop), `10:226` (Handy)
   - Ablauf: `21:2` (Desktop), `15:209` (Handy)
   - Ablauf nach Agent: `47:28` (Desktop), `47:209` (Handy), Komponente „Ablauf / Agent-Karte“ `46:78`
   - Abhängigkeiten: `15:1662`
   - Freigabe / Auswertung: `35:2` / `35:54`
   - Projekt: `15:2`, Deine Aufgaben: `15:1730`; Alle Projekte: `20:6` (Desktop), `21:108` (Handy)

## Design-Regel: Routen ohne Design-Issue (SIN-574)

- **Ohne Design-Issue erlaubt:** neue Route/Seite, die nur aus vorhandenen Komponenten und Tokens besteht. Beleg: Nachweis-Bilder (SIN-561).
- **Design-Issue nötig:** neue Komponente, neue Farbe/Token, geänderte Navigation.
- Jede so angelegte Route steht in `docs/design/OFFEN-FIGMA.md` (Route, Datum, PR). Claude zieht sie im Chat wöchentlich in Figma nach und entfernt dann die Zeile. Der Hausmeister (SIN-551) soll Einträge älter als 14 Tage melden.
- Prüfer-Regel: Jedes neue Skript unter `scripts/` läuft vor dem Merge einmal als Trockenlauf in CI (`DRY_RUN=1`). Begründung: `docs/decisions/SIN-574-routen-ohne-design-issue.md`.

## Grundsatz

- Der Leitstand zeigt nur echte Daten aus Supabase (`loop_events`, `loop_snapshot`, SIN-303). Keine erfundenen Zahlen, keine Platzhalter-Statistiken.
- Claude-Kontingente sind Schätzungen und werden so gekennzeichnet.
- Aktionen (Freigeben, Planer jetzt, Notbremse) laufen nur serverseitig mit eigenem Token und werden protokolliert.
- Login nur für Sinan (Magic-Link, RLS).

## Technik

- Next.js 16 auf Vercel, PWA. **Dies ist nicht das Next.js aus dem Trainingswissen:** vor dem Code `node_modules/next/dist/docs/` lesen.
- Daten: Supabase EU (gleiches Projekt wie die Lern-App oder eigenes, Entscheidung in `docs/decisions/`).
- Ablauf-Ansicht: React Flow (xyflow, MIT), erst in SIN-305.

## Design

- Dunkler Leitstand-Look: 2 px Rundung, 1-px-Linien, keine Schatten, kein Leuchten, keine Verläufe, keine Glas-Effekte.
- Farben nur als Token (`var(--color-*)`), nie als Hex im Code. Status-Farben nur für Zustände.
- Schrift: Geist, Geist Mono für Kennungen und Zahlen. Keine weitere.
- Barrierefreiheit: WCAG 2.2 AA, Kontrast ≥ 4,5:1, Tastatur, Ziele ≥ 44 px, `prefers-reduced-motion` beachten.

## Verboten

- Zugangsdaten ins Repo (öffentlich werden kann). Nur `.env.example` mit Namen.
- Barrierefreiheits-Tests abschalten, um etwas durchzubringen.
- Personendaten in Prompts.

## Loop (SIN-413)

Der Leitstand baut sich selbst wie die Lern-App, in schlanker Form:

1. `dispatch.yml` (alle 2 Stunden, von Hand und nach jedem Merge) holt aus Linear die Todo-Issues im Projekt „Leitstand“ mit Label `claude`, die nicht blockiert sind. Höchstens `LOOP_MAX_PARALLEL` (Standard 1) laufen gleichzeitig.
2. Für jedes gewählte Issue entsteht ein GitHub-Issue mit Label `claude`. Das startet `claude.yml`. Linear springt auf „In Progress“.
3. Der Worker öffnet den PR. `build` prüft, `automerge.yml` mergt per Squash, sobald `build` grün ist.
4. `loop-merge.yml` setzt das Linear-Issue aus dem PR-Titel auf „Done“ und startet sofort das nächste.
5. `repair.yml`: Ist `build` auf einem `claude/`-PR rot, bittet der Loop `@claude` um Reparatur. Höchstens 3 Runden (`repair:1` bis `repair:3`), dann `needs-human` und Hinweis in Linear.

Regeln:

- Ein Linear-Issue startet nur mit Label `claude` und Status „Todo“.
- Nachrücken (SIN-417): Ist keins mehr in der Schlange, setzt `dispatch` das wichtigste Backlog-Issue (Priorität, dann ältestes) auf „Todo“ mit Label `claude`. Nie mit Label `design`, `sinan` oder `needs-human`, nie blockiert. Wer ein Backlog-Issue zurückhalten will, gibt ihm eins dieser Labels.
- Risiko setzt `automerge.yml` als Label (Sinan, 13.10.2026, wie SIN-547 in der Lern-App). `risk:medium` (Standard): Auto-Merge nach grünem `build`, auch bei Workflow-Änderungen (Schritte, Skripte, Zeitpläne, bekannte Secrets). `risk:high` wartet auf Sinans Label `freigegeben`: Workflow-Rechte erweitert (`write`), neues Secret ohne Verwendung auf main, `pull_request_target`, Drittanbieter-Action außerhalb `actions/*`, `anthropics/*`, `github/*`, Datenverlust in Migrationen (drop/delete/truncate/alter … drop|rename), `src/middleware`, `src/lib/auth`, `src/lib/kopplung`, Service-Role-Key im Client. Der Grund steht als PR-Kommentar. `no-automerge` und Draft stoppen immer.
- Ereignisse landen in `loop_events` mit Projekt `leitstand`, sobald die Secrets `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` im Repo stehen. Ohne sie gibt es nur eine Warnung im Log.
- Logik in `src/lib/loop/auswahl.ts` (rein, mit Tests), Netz in `scripts/loop/loop.ts`.

## Qualitätsstandard (SIN-641)

`docs/STANDARD.md` ist Pflicht für Worker, Prüfer und Testnutzer: Note 1, kein Agent-Slop. Verbotene Muster stehen in `src/lib/standard/muster.ts`.

## Done heißt live (SIN-616)

- Ein Linear-Issue darf nur auf „Done“, wenn die Funktion läuft (Workflow aktiv, Migration angewendet, Secret gesetzt), nicht nur, wenn Code oder eine `.vorlage` gemergt ist.
- Bleibt etwas für Sinan (Workflow-Datei, Migration einspielen, Secret), legt der Worker dafür ein Linear-Issue mit Label `sinan` an und verlinkt es im PR. Das Original bleibt bis dahin „In Review“. Fehlt `LINEAR_API_KEY`, steht die Aufgabe im PR unter `## Aufgabe für Sinan`.
- Fehlende Secrets bündelt der Worker in ein einziges `sinan`-Issue (bis SIN-611 sie aus Infisical holt).
- Der Worker läuft mit `AGENT_WORKFLOW_TOKEN` (Workflows RW) und ändert `.github/workflows/` selbst, keine neuen `.vorlage`-Dateien. `automerge.yml` setzt `risk:high` nur bei Rechte-Erweiterungen, neuen Secrets, neuen Drittanbieter-Actions oder Änderungen am Gate (wie SIN-234/SIN-252 der Lern-App).
- Der Worker legt `sinan`-Issues mit `LINEAR_API_KEY` selbst an (Linear-GraphQL per `curl`).

## Abnahme-Proben (SIN-626)

- **Kein Done ohne grüne Probe.** Jedes Issue bekommt beim Bauen mindestens eine Probe in `docs/abnahme.yml` (HTTP, lesende Abfrage, Datei-Check) mit erwartetem Ergebnis. Ein Issue ohne Probe gilt nicht als fertig; ein Linear-Issue geht erst auf „Done“, wenn seine Probe im Leitstand („Läuft es wirklich?“) grün ist.
- `abnahme.yml` (stündlich) führt alle Proben aus und schreibt je Probe eine Zeile in `loop_events` (Schritt `abnahme`). Rot länger als 2 Stunden löst den Alarm aus. Logik in `src/lib/abnahme/abnahme.ts` (rein, mit Tests), Netz in `scripts/abnahme/abnahme.ts`. Entscheidung: `docs/decisions/SIN-626-abnahme-proben.md`.

## Steuerung nur im Leitstand (SIN-577)

Neue Steuerlogik (Rollen, Auslöser, Planung, Messung, Kosten) entsteht nur im Leitstand, mit `produkt` als Parameter. Ein Produkt-Repo bekommt keine neuen Workflows außer Bauen, Testen, Deployen und Produkt-Pipelines. Der Anwalt/Prüfer markiert PRs, die das verletzen, mit `no-automerge`. Begründung und Umzugsplan: `docs/decisions/SIN-577-steuerung-im-leitstand.md`.

## Weniger Fehlschläge (SIN-638)

Gilt für Worker und Planer, Wortlaut in `docs/skills/bauen/SKILL.md` und `docs/skills/planer/SKILL.md`.

1. **Größe:** höchstens ca. 300 geänderte Zeilen oder 1 Bereich (Frontend, Backend, Content, Infra). Größere Issues zerlegt der Planer vorher.
2. **Erst Test, dann Code:** zuerst Test bzw. Abnahme-Probe aus „Fertig, wenn“, rot sehen, dann bauen.
3. **Zwei rote Läufe:** kein dritter Neustart. Kommentar mit Ursache und Vorschlag zum Zerlegen; der Planer legt Unter-Issues an.
4. **Grund Pflicht:** jeder rote Lauf hat einen `grund` (SIN-617).
5. **Kontext schlank:** Issue, betroffene Dateien, `AGENTS.md`, passender Skill, relevante `LEHREN.md`.

## Pull Requests

### Übergabe an Codex (SIN-832)

Risikoarme Aufgaben können bestehende Agenten über einen Draft-PR gemäß [docs/CODEX-WORKER.md](docs/CODEX-WORKER.md) an den ereignisgesteuerten Codex-Worker übergeben. Ein Issue hat genau einen Implementierer: nach der Übergabe baut Claude nicht parallel daran weiter. Der andere Worker darf unabhängig prüfen. Dieser Weg erweitert keine Rechte und ändert weder Dispatcher noch Freigabegrenzen.

- Ein PR pro Linear-Issue. Titel als Conventional Commit mit Linear-ID, z. B. `feat(uebersicht): Projekt-Karten (SIN-304)`.
- Commit-Nachrichten enthalten `Part of SIN-xxx`.
- Vor dem Push: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`.
- Höchstens 3 Reparaturrunden pro PR, dann stoppen und Blocker melden.
- Nie selbst mergen.

## Projekt-Wächter (SIN-419)

- `scripts/waechter/waechter.ts` (Netz) und `src/lib/waechter/` (rein, mit Tests): je Linear-Projekt „In Progress“ mit Projekt-Link „GitHub“ Schlange füllen, Hänger reparieren, Tages-Update; neue Projekte einrichten.
- Workflow: `.github/workflows/waechter.yml` (stündlich, Minute 41, und von Hand). Trockenlauf: von Hand mit `dry_run` oder lokal `DRY_RUN=1`.
- `AGENT_WORKFLOW_TOKEN` braucht Lese- und Kommentarrechte auf alle aktiven Repos.

## Schlank bauen: Ponytail (Sinan, 13.10.2026)

Für jede Code-Aufgabe gilt zusätzlich `docs/skills/ponytail/SKILL.md` (Stufe **full**, MIT, Quelle im Dateikopf). Kurz:

1. Braucht es das überhaupt? Nichts bauen, was niemand verlangt hat; Weggelassenes in einer Zeile nennen.
2. Gibt es es schon im Repo (Helfer, Komponente, Muster)? Dann so nutzen wie der Code drumherum.
3. Sonst Standardbibliothek/Plattform, dann eine vorhandene Abhängigkeit. Keine neue Abhängigkeit für ein paar Zeilen.
4. Erst dann minimaler neuer Code. Kürzester vollständiger Diff gewinnt; alle betroffenen Aufrufer, Tests und Fixtures werden mitgezogen.
5. Abkürzung mit bekannter Grenze: Kommentar `shortcut: <Grenze>, <wann ausbauen>`.

Nie gekürzt: Prüfungen an Vertrauensgrenzen, Fehlerbehandlung gegen Datenverlust, Sicherheit, Barrierefreiheit, alles, was im Issue steht. Bei Widerspruch gelten die Regeln dieser Datei (Tests, Entscheidungsdatei, LEHREN.md, Figma). Im PR steht unter `## Ausgelassen` in ein bis zwei Zeilen, was bewusst weggelassen oder nicht geprüft wurde.
