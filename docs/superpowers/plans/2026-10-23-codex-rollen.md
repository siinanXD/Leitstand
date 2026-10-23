# Codex-Rollen Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; implement inline, then independent whole-branch review.

**Goal:** Claude übernimmt Entwicklung; Codex bekommt explizite, begrenzte Rollenaufträge.
**Architecture:** Bestehende reine Auswahl plus Linear-Delegate im Dispatcher. Keine neue Laufzeit oder Modell-API.
**Tech Stack:** TypeScript, node:test, Linear GraphQL.
**Spec:** docs/decisions/SIN-1052-codex-rollen.md

## Global Constraints
- Keine neuen Secrets, Rechte, Abhängigkeiten oder Budgets; bestehende Gates und Reparaturstopps erhalten.
- Ein Codex-Auftrag im gesamten gesteuerten Projektbestand; unbekannter Stand sperrt Starts.
- Kein Workerwechsel allein aufgrund fehlender Branches oder vergangener Zeit.

## Review Focus
- Mehrere/ungültige Rollenmarker: kein Codex-Start.
- Halb erfolgte Delegation: Platz bleibt belegt.
- Offener Claude-PR: keine zweite Implementierung.
- Codex-App fehlt vor Delegation: Claude übernimmt genau den ungestarteten Auftrag.
- Lesefehler im globalen Bestand: kein neuer Codex-Start.

### Task 1: Auswahl und Übergabe
**Files:** src/lib/loop/auswahl.ts, src/lib/loop/auswahl.test.ts, scripts/loop/loop.ts; Doku und docs/abnahme/SIN-1052.yml.
**Interfaces:** codexRolle(description) liefert review|planer|content|null; codexStarts(issues, belegung) liefert höchstens einen Kandidaten; codexRueckfall liefert ohne bestätigtes Ende keine Timeout-Übergabe.
- [ ] Rollen-, Begrenzungs- und Timeout-Regressionen schreiben, rot ausführen.
- [ ] Vorhandene Auswahl, globalen Bestandsabruf und Rollenhinweis vor Delegation ergänzen.
- [ ] Regressionen und tatsächlichen Dispatcher mit Netz-Fixtures prüfen.
- [ ] Doku, Probe, Lint, Typecheck, Gesamtsuite und unabhängigen Review ausführen; Draft-PR mit echten Prüfergebnissen veröffentlichen.

## Entscheidungen während der Ausführung
- Umsetzung ohne weitere Routinefreigabe gemäß AGENTS.md/SIN-840 und aktuellem Nutzerauftrag.
- Git-Proxyausfall: aktueller Remote-Snapshot 11082718 über Connector geladen; Veröffentlichung über denselben Connector.
- Live-Kontoverknüpfung und Agentenende nicht aus App-Präsenz oder Dateiproben ableiten.
