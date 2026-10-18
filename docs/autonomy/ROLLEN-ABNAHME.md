# Rollen-Abnahme (SIN-826)

Prüfstand: 18.10.2026, Basis `3541c362d6290f1b1a3e5c503c2d1d1e4bd0509b`. Momentaufnahme, kein Live-Status. Rolle ist eine Aufgabe; Claude/Codex sind ausführende Worker. Ein grüner Job, eine Fixture oder ein Tool-Name allein belegt keine erfolgreiche Rollenwirkung.

## Alle registrierten Rollen

| Rolle | Tatsächlicher Auslöser / Ausführer | Werkzeuge und Ergebnisbeleg | Abnahme / nächster Schritt |
| --- | --- | --- | --- |
| CEO (`ceo`) | täglich 04:10 UTC; `scripts/ceo/ceo.ts`, deterministisches Skript | [Lauf](https://github.com/siinanXD/Leitstand/actions/runs/39112913195): vier Produktentscheidungen protokolliert; Lern-App/Leitstand weiterbauen, SJCODE/Stromlauf warten mangels Daten | Entscheidung belegt, Wirkung innerhalb 7 Tagen nicht abgenommen. Kein Modell-Worker. |
| Visionär (`visionaer`) | CEO → `visionaer.yml` → Claude-Abo | Workflow/Schema vorhanden; kein geprüfter erfolgreicher Versionsvorschlag in dieser Stichprobe | Absichtlich pausiert durch SIN-627. Nicht aktivieren. |
| Planer (`planer`) | Merge/Abnahme/Fertig-Liste plus täglich 04:00 UTC; Skript, Spur C ggf. Anthropic-API | [Gesamtlauf](https://github.com/siinanXD/Leitstand/actions/runs/39158337127) erfolgreich; Linear-Abfragen nach PR 264/265 funktionieren | Ablauf belegt, separate Live-Probe SIN-825 und spätere Issue-Wirkung offen. Keine Codex-Auswahl implementiert. |
| Research (`research`) | ausdrücklicher Auftrag an Bauen/CEO; CLI oder Claude mit Websuche | `scripts/autonomy/research.ts` war durch CommonJS/Top-Level-await kaputt; repariert und mit Netz-Fixtures geprüft. [Echte GitHub/HF-Verbindungsprobe](../decisions/SIN-826-research.md) im Codex-Worker erfolgreich, ohne HF-Token/Modellaufruf. Separates `scripts/recherche/recherche.ts` fordert WebSearch/WebFetch an | Einstieg und öffentliche Quellen in dieser Laufzeit belegt; Context7/Claude-Zugriff offen. Suchtreffer sind keine fachliche Empfehlung/Lizenz-Abnahme. |
| Bauen (`bauen`) | Dispatcher → Issue mit claude-Label → Claude-Abo; alternativ expliziter Codex-Draft gemäß CODEX-WORKER | [Codex-Ergebnis PR 268](https://github.com/siinanXD/Leitstand/pull/268), [main-CI](https://github.com/siinanXD/Leitstand/actions/runs/39158280120) grün. Leitstand-Claude erlaubt ausgewählte Bash-Befehle/Figma, nicht Context7/WebFetch; letzter untersuchter [Claude-Lauf](https://github.com/siinanXD/Leitstand/actions/runs/39156819490) fehlgeschlagen | Codex-Übergabe zweimal belegt. Claude-End-to-End und Doku-Tools nicht vollständig abgenommen; SIN-537 wieder In Review. |
| Prüfen (`pruefen`) | PR-Push / Deploy; CI-Skripte und separater API-Prüfer | [Build/Test/Playwright/axe](https://github.com/siinanXD/Leitstand/actions/runs/39158280120) erfolgreich; [Security-Draft 269](https://github.com/siinanXD/Leitstand/pull/269) noch nicht wirksam | CI belegt; unabhängiger Modellreview für Codex, Secrets-Grenze und Pflichtstatus blockiert durch SIN-827. Langfuse-Projektzugriff belegt keine Score-Nutzung im einzelnen Review. |
| Content (`content`) | Aufgabenart von Bauen, produktseitige Content-Fabrik; Modell-APIs im freigegebenen Content-Budget | [Fabrik](https://github.com/siinanXD/Content-Agent-Lernapp/actions/runs/39156645750) rot: OpenAI HTTP 429 `billing_not_active`, zusätzlich Timeout einer amtlichen Quelle | Aktuell blockiert, keine Veröffentlichung/Neustarts durch diese Abnahme. SIN-453 erneut offen, SIN-808 weiter bei bestehender Bearbeitung. Keine historischen DB-Zählungen als aktuellen Stand übernehmen. |
| Marketing (`marketing`) | Workflow nur manuell; Anthropic-API plus Daten | `marketing.yml` ohne Zeitplan; kein neuer Lauf ausgelöst | Absichtlich pausiert (SIN-627), keine Qualitäts- oder Tool-Abnahme behauptet. |
| Hausmeister (`hausmeister`) | montags 05:00 UTC, Skript mit Bash/knip | Workflow und Quellcode vorhanden; kein Ergebnis-Link in der gelesenen jüngsten Lauf-Stichprobe bestätigt | Nicht als funktionsfähig abgenommen; nächster regulärer Lauf muss konkrete Fundliste/PR und Tests belegen. Kein erzwungener Schreib-Lauf. |
| Anwalt (`anwalt`) | relevante PR-Pfade / monatlich; regelbasiertes Skript und GitHub-Kommentar | `anwalt.yml` vorhanden; kein konkret geprüftes erfolgreiches Rechts-Prüfergebnis dieser Stichprobe | Nicht live abgenommen. Quellen-/Rechtsbewertung bleibt auf den jeweiligen Inhalt begrenzt. |
| Gedächtnis (`gedaechtnis`) | nach Merge plus 05:50 UTC; Skript/GitHub | [Lauf](https://github.com/siinanXD/Leitstand/actions/runs/39158337134) grün und Koordinationsnotiz im Vault tatsächlich zurückgelesen | Schreiben/Lesen belegt, vollständiger Aktualitätsabgleich aller Produkte offen. Ein Trockenlauf ohne Push wäre kein Nachweis. |
| Bot Advisor (`botadvisor`) | ausdrücklicher Nutzerauftrag im Chat; Prompt/Schema, kein eigener Dispatcher | Skill und Fixture vorhanden, kein abgenommener echter Agentenentwurf gefunden | Registereintrag startet nichts. Skill korrigiert: rollen.json überwacht nur; Auslöser, Worker, Tools und erstes Ergebnis separat belegen. Infisical bleibt pausiert. |
| Trend (`trend`) | Workflow nur manuell; öffentliche Recherche, Bewertung ggf. Anthropic-API | `trend.yml` ohne Zeitplan; kein neuer Lauf ausgelöst | Absichtlich pausiert (SIN-627); nicht allein wegen erneutem Abo-Kontingent aktivieren. |

## Werkzeug-Nachweise sind an die Laufzeit gebunden

Der [Werkzeug-Lauf](https://github.com/siinanXD/Leitstand/actions/runs/39152341649) ist insgesamt grün, meldet aber ausdrücklich:

- Sentry, Langfuse, Figma und Linear: lesender Verbindungscheck grün.
- OpenAI/Anthropic: Modelle-Auflisten grün; das prüft keine erfolgreiche Generierung und widerspricht nicht dem Billing-Fehler im Content-Worker.
- PostHog: nicht erreichbar. Postman: `POSTMAN_API_KEY` fehlt.
- Hugging-Face-Whoami: `HF_TOKEN` fehlt. Die öffentliche Modell-Suche des Research-Skripts benötigt diesen Token nicht; ein roter Identitätscheck darf nicht pauschal als blockierte öffentliche Suche gelten.
- Context7 fehlt im Leitstand-Claude-Workflow; Lern-App hat eine MCP-Konfiguration. Kein erfolgreicher Aufruf allein durch die Konfiguration belegt. Bestehendes SIN-537 wieder zur Abnahme geöffnet.

Diese Ergebnisse gelten für den jeweiligen Actions-Job. ChatGPT-Connectoren oder ein interaktiv verbundenes Figma beweisen keine Verfügbarkeit im Claude-Worker. Keine Tool-Liste wurde um Berechtigungen erweitert.

## Übergabe, Anzeige und Kosten

Ein Issue hat einen Implementierer. Vor Start Linear In Progress, vorhandene Claims/PRs lesen; beim Codex-Weg Start-/Completion-Marker, Commit, Tests, Quellen und Blocker gemäß [CODEX-WORKER.md](../CODEX-WORKER.md). Kein zweiter Worker auf demselben Branch. Nach Merge bis unabhängiger Live-Abnahme In Review. Allein grüner Build setzt keine offene Sicherheitsabnahme auf Done.

`docs/autonomy/agents.json` enthält die 13 Rollen/Skills. Team-Karten und Ablauf lesen dagegen `src/data/agents.json` (zehn Einträge, darunter historische Begriffe); die Noten lesen die 13 Rollen. `docs/autonomy/rollen.json` beschreibt Überwachungstakte, keine Ausführung. Das erklärt unterschiedliche Sichtbarkeit. Codex-Claims stehen bislang in PR/Linear, nicht automatisch in loop_events. Eine neue Rolle oder ein Monitoring-Eintrag behebt das Routing nicht.

Claude-Action nutzt das bestehende Abo-OAuth-Token. Codex-Übergaben laufen im verbundenen Worker. `scripts/pruefer/pruefer.ts` verwendet hingegen OpenAI-API-Key, ggf. Anthropic-API-Fallback; Plus/Max bezahlt das nicht. Diese Prüfung löst keine Modell-API-Aufrufe aus. Die neue CLI-Prüfung nutzt ausschließlich lokale Netz-Fixtures; ein bezahlter oder produktiver Lauf wird daraus nicht abgeleitet.

## Offene Arbeit

1. SIN-453: API-Abrechnung/Organisation des tatsächlich verwendeten Content-Keys prüfen; keine Zahlung/Rotation durch Agenten.
2. SIN-537 und SIN-827: konkrete getestete Berechtigungs-/Security-Drafts und unabhängiger Review, vor Wirksamwerden Freigabe.
3. Nach dieser Bestandsaufnahme Sichtbarkeit/Worker-Zuordnung in einem kleinen Folgeauftrag verbinden, ohne doppelte Implementierer oder neue Modellkosten. Fehlende Tool-/Ergebnisbelege bleiben sichtbar offen.
4. Für jede nicht abgenommene aktive Rolle einen echten Ergebnisnachweis im vorgesehenen Takt erfassen. Schema-Fixtures und diese Datei-Probe sind nur Struktur-/Dokumentnachweise.

Infisical, Marketing/Trend/Visionär und SIN-716–719 bleiben gemäß bestehenden Pausen unverändert. Keine produktiven Secrets, Gates, Datenbanken oder Deployments geändert.
