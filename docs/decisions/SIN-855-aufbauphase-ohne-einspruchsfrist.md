# SIN-855: Aufbauphase ohne feste Einspruchsfrist

Entscheidung Sinan, 19.10.2026, 22:41 Europe/Berlin. Ersetzt die Fristen aus SIN-812 (30 Min für `risk:medium`). Gleiche Regel wie in der Lern-App (Content-Agent-Lernapp#437, dort beim bestehenden Implementierer).

## Regel

- `risk:low` und `risk:medium`: Auto-Merge sofort nach grünem Pflicht-Check `build` und ohne Blocker, keine Zeitfrist. Die Risikoklasse bleibt: Workflow-Änderungen werden nicht auf low umetikettiert.
- Alte Marker `einspruch`, `einspruch:2h`, `einspruch:30m` und gespeicherte `bis`-Werte sperren nicht. Jeder Lauf von `automerge.yml` bewertet den PR neu, auch alte offene PRs (Label `unlabeled`/`synchronize`/Neuöffnen oder von Hand erneut starten).
- Unverändert gesperrt: `risk:high` ohne `freigegeben`, `no-automerge`, Draft, rote Pflicht-Checks, Secret-, Datenverlust- und Geldgrenzen.
- Tests, Sicherheitsprüfung, unabhängiges Review und Kriterienbelege entfallen nicht.
- Nach jedem Merge startet `dispatch.yml` sofort; ein Worker startet nur bei freiem Platz, Kontingent und startbarem Issue.
- Technik: `wartezeitMs` und `FRIST_MINUTEN` sind aus `scripts/loop/risiko.mjs` entfernt, `automerge.yml` wartet nicht mehr. Die Station „Einspruchsfrist“ im Fließband (`src/lib/fliessband`) entfällt.

## Rückkehr zu Fristen

Erst nach separat dokumentierter, belegter Produktreife und Workflow-Abnahme. Kein automatischer Wechsel nach Datum oder Merge.

## Offen

- Produkt-Repos (SJCODE-website, stromlauf-ai) nutzen die pr-gate-Vorlage aus SIN-812. Abgleich als eigener Auftrag, Verweis im PR.
- Beleg für „Done“: ein Folge-PR, der ohne Frist mergt (Head- und Run-Link im PR nachtragen). Code-Merge allein ist kein Done.
