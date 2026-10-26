# SIN-1053 Abo-only-Prüfer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Native Umsetzung in dieser Sitzung.

**Goal:** Den unabhängigen Prüfer ausschließlich über native Codex-Reviews betreiben; fehlende Belege sperren weiterhin.
**Architecture:** Bestehende Workflow-Zielvalidierung behalten. Native Requests an Head/Basis/Auftrag binden, vertrauenswürdige Bot-Reviews lesen, Kriterien separat validieren. Keine Modell-API, keine automatische Umgehung.
**Tech Stack:** TypeScript, Node built-ins, gh, bestehende GitHub Actions.
**Spec:** Linear SIN-1053, maßgebliche Abo-only-Präzisierung vom 25.10.; aktueller Nutzerauftrag.

## Global Constraints
- Kein Modell-API-Aufruf/Fallback/Creditkauf; kein Produktionsstart während Umsetzung.
- Keine untrusted PR-Ausführung mit Secrets; Head/Basis/Kriterien bleiben gebunden.
- Native Code-Review ohne Kriterienbelege ist niemals eine vollständige Freigabe.
- Keine Zähler-/Repair-/needs-human-Rücksetzung oder Selbstmerge.

## Review Focus
- Gefälschte Bot-Marker, unvollständige JSON-Antworten, widersprüchliche Marker sperren.
- Review eines alten Heads oder einer alten Basis/Kriterienfassung sperrt.
- Fehlende Kriterien und echte Funde bleiben offen; [nach Aktivierung] bleibt Live-Aufgabe.
- Wiederholung/Timeout/Kontingent erzeugt keinen zweiten Start für denselben Stand.
- Trockenlauf erzeugt keinen produktiven Stand oder Modell-/GitHub-Schreibzugriff.

## Tasks
- [x] Negative native Review-/Request-/Kriterien-Tests schreiben und rot sehen.
- [x] Reinen Parser und Request-Auswahl implementieren; zuerst grüne Tests.
- [x] Bestehende CLI auf native Quelle umstellen, alte API-Pfade entfernen; geschlossene Adapterproben für Anstoß/Warten/Ergebnis/Fehler.
- [x] Workflow ohne Modell-API-Secrets; Ergebnis erneut lesen, bestehende Vertrauens- und Aktualitätschecks erhalten. Trockenlauf/Abnahme ergänzen.
- [x] Typecheck, strenges ESLint, passende Regressionen und vollständige Suite prüfen; unabhängiger Abschlussreview.
- [ ] Lokal committen. Keine Veröffentlichung, solange main durch Veröffentlichung kostenpflichtigen Prüfer anstoßen könnte. Konkrete Aktivierung anschließend reviewbar dokumentieren.

## Ausführungsledger
- Parser-, Ablauf- und CLI-Proben jeweils zuerst rot, danach grün. Tatsächliche native PR454-Zusammenfassung als Issue-Kommentar berücksichtigt; Kriterien separat gebunden.
- Vor Abschlussreview: Gesamtsuite Node22 mit Parallelität4 866/866 grün; Typecheck und strenges geänderte-Dateien-ESLint grün.
- Unabhängiger Review: keine kritischen, drei wichtige Befunde. Jeweils neue rote Regressionen: Warteschlange, verlorene Antwort bei Snapshot/Publikation sowie unvollständiger Kriterienvertrag.
- Korrekturen: dokumentiertes GitHub queue:max; Fingerprint der gelesenen authentischen Antwortversionen statt Veröffentlichungszeit; strikte native Ergebnis-/Haken-/Fundvalidierung.
- Ruling: GitHub-Queue auf 100 wartende Läufe begrenzt (plattformseitiges Maximum). Keine unbegrenzte Queue behaupten; Überlast benötigt Wiederaufnahme anhand der GitHub-Laufstatus.
- Ruling: Produktionsprüfungen von Drafts bleiben gesperrt. Manuelle Trockenläufe bleiben möglich; vorzeitige Veröffentlichung eines Gesamtbelegs wird nicht eingeführt.
- Ruling: Gemeinsamen build.yml-Diff entfernt, um den offenen PR473 nicht zu überlappen. Type-only-Abhängigkeiten weisen die echten Unterprozess-CLIs für die vorhandene Testauswahl aus; beide CLIs werden über geschlossene Fixtures geprüft, Nachlauf mit DRY_RUN=1.
- Final: minor (deferred): Bei einem Ledger-Transportfehler nach fertiger lokaler Prüfung kann ein gültiges Artefakt bestehen bleiben, während der Abbruchtext generisch keinen gültigen Beleg meldet. Workflow bleibt rot; keine erfolgreiche Aktivierung daraus ableiten.
- Veröffentlichung: Nur Branch-Push ohne PR erwägen, wenn alle branchweiten Push-Auslöser überprüft sind. Ein PR löst auf main noch den bisherigen Modell-API-Prüfer aus; nicht anlegen, solange das nicht ausgeschlossen ist.

- Final: drei wichtige Reviewbefunde jeweils durch rote und anschließend grüne Regressionen korrigiert; abschließende Gesamtsuite 871/871 ohne Fehler, Typecheck, vollständiger Lint und strenges ESLint grün. Keine neuen ungenutzten Codex-Module/Exporte in Knip.
