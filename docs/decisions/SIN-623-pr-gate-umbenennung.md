# SIN-623: pr-gate erkennt umbenannte Workflows

Datum: 14.10.2026. Anlass: PR #150 legte per Umbenennung (`*.vorlage` → `.github/workflows/*.yml`) vier Workflows mit `write` an. Das Gate prüfte nur `+`-Zeilen des Diffs, die es bei reiner Umbenennung nicht gibt, und setzte `risk:medium`.

## Entscheidung

- Die Einstufung steht in `scripts/loop/risiko.mjs` (rein, getestet in `src/lib/loop/risiko.test.ts`). `automerge.yml` checkt den Basis-Branch aus (nie PR-Code) und lädt das Modul.
- Kommt eine Datei neu nach `.github/workflows/` (Status `added`, `renamed`, `copied`, Vorgänger nicht in `.github/workflows/`), wird der **volle Inhalt** vom PR-Head geprüft, nicht der Diff.
- Ein vorhandenes `risk:high` (Mensch, Claude, früherer Lauf) wird vom Gate nie gesenkt, nur angehoben.
- Die Änderung am Gate ist selbst `risk:high` (automerge.yml), Freigabe durch Sinan.

## Offen für Sinan

Die Lern-App (`siinanXD/Content-Agent-Lernapp`, `scripts/autonomy/risk.mjs`, `classifyRisk`) ist aus diesem Repo nicht änderbar. Gleiche Regel dort nachziehen: voller Inhalt bei `added|renamed|copied` nach `.github/workflows/`, `risk:high` nie senken. Dafür ein eigenes Issue in der Lern-App.
